import zlib from "node:zlib";
import {
  MAX_OUTPUT_BYTES,
  WS_BACKPRESSURE_THRESHOLD_BYTES,
  WS_CLOSE_BACKPRESSURE,
  WS_OUTPUT_BROTLI,
  WS_OUTPUT_BROTLI_CTX,
  WS_OUTPUT_BROTLI_QUALITY,
  WS_OUTPUT_COMPRESS_THRESHOLD_BYTES,
  WS_OUTPUT_CTX_HEADER_BYTES,
  WS_OUTPUT_GZIP,
  WS_OUTPUT_GZIP_LEVEL,
  WS_OUTPUT_RAW,
  WS_PENDING_CLIENT_MAX_BYTES,
  WS_PENDING_CLIENT_MAX_CONTROL_MESSAGES,
  WS_READY_STATE_OPEN,
} from "./constants.js";
import type { ManagedClient, ManagedSession } from "./session-manager.js";
import type { ServerToClientMessage } from "./types.js";
import { getBufferedAmount, type ClientSocket } from "./utils/ws-socket.js";

// Persistent Brotli compressor for the context-takeover mode ("br-ctx"). Each
// output frame is flushed as a chunk of ONE continuous Brotli stream, so frame N
// compresses against frames 0..N-1 (the prior screen primes the LZ77 window —
// the delta). Per-client, created on promote, released on detach. The flushes
// are chained (a per-encoder FIFO) so frames compress + ship in PTY order even
// though each flush is async (the BROTLI_OPERATION_FLUSH callback fires on the
// next tick). The accumulator is trimmed after each flush so a long session
// doesn't grow without bound.
export interface BrotliEncoder {
  flush: (bytes: Uint8Array<ArrayBuffer>) => Promise<Buffer<ArrayBuffer>>;
  queuedBytes: () => number;
  release: () => void;
}

export const makeBrotliEncoder = (level: number): BrotliEncoder => {
  const encoder = zlib.createBrotliCompress({
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: level },
  });
  let outputChunks: Buffer[] = [];
  let outputBytes = 0;
  let pendingBytes = 0;
  let released = false;
  let tail: Promise<void> = Promise.resolve();

  encoder.on("data", (chunk: Buffer) => {
    outputChunks.push(chunk);
    outputBytes += chunk.length;
  });

  const compress = (bytes: Uint8Array<ArrayBuffer>): Promise<Buffer<ArrayBuffer>> =>
    new Promise((resolve, reject) => {
      if (released) {
        reject(new Error("Brotli encoder released"));
        return;
      }
      let settled = false;
      const finish = (error?: Error): void => {
        if (settled) return;
        settled = true;
        encoder.off("error", onError);
        encoder.off("close", onClose);
        if (error) {
          reject(error);
          return;
        }
        const output = Buffer.concat(outputChunks, outputBytes);
        outputChunks = [];
        outputBytes = 0;
        resolve(output);
      };
      const onError = (error: Error): void => finish(error);
      const onClose = (): void => finish(new Error("Brotli encoder closed"));
      encoder.once("error", onError);
      encoder.once("close", onClose);
      try {
        encoder.write(bytes);
        encoder.flush(zlib.constants.BROTLI_OPERATION_FLUSH, () => {
          setImmediate(() => finish(released ? new Error("Brotli encoder released") : undefined));
        });
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });

  const flush = (bytes: Uint8Array<ArrayBuffer>): Promise<Buffer<ArrayBuffer>> => {
    if (released) return Promise.reject(new Error("Brotli encoder released"));
    pendingBytes += bytes.byteLength;
    const result = tail.then(() => compress(bytes));
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result.finally(() => {
      pendingBytes = Math.max(0, pendingBytes - bytes.byteLength);
    });
  };

  const release = (): void => {
    if (released) return;
    released = true;
    outputChunks = [];
    outputBytes = 0;
    try {
      encoder.destroy();
    } catch {
      return;
    }
  };

  return { flush, queuedBytes: () => pendingBytes, release };
};

export class SessionOutputTransport {
  private readonly sendControl: (ws: ClientSocket, payload: ServerToClientMessage) => void;

  constructor(sendControl: (ws: ClientSocket, payload: ServerToClientMessage) => void) {
    this.sendControl = sendControl;
  }

  async sendScrollback(
    ws: ClientSocket,
    managed: ManagedSession,
    client: ManagedClient,
  ): Promise<void> {
    const snapshot = managed.session.snapshotScrollback();
    if (!snapshot) return;
    const bytes = Buffer.from(snapshot, "utf8");
    for (let offset = 0; offset < bytes.byteLength; offset += MAX_OUTPUT_BYTES) {
      await this.sendOutputFrame(ws, bytes.subarray(offset, offset + MAX_OUTPUT_BYTES), client);
    }
  }

  private sendOutputBytes(ws: ClientSocket, bytes: Uint8Array<ArrayBuffer>): void {
    if (ws.readyState !== WS_READY_STATE_OPEN) return;
    if (getBufferedAmount(ws) > WS_BACKPRESSURE_THRESHOLD_BYTES) {
      ws.close(WS_CLOSE_BACKPRESSURE, "backpressure");
      return;
    }
    try {
      ws.send(bytes);
    } catch {
      /* socket closed between readyState check and send */
    }
  }

  private compressPayload(
    bytes: Uint8Array<ArrayBuffer>,
    mode: "br" | "gzip",
  ): Buffer<ArrayBuffer> {
    return mode === "br"
      ? zlib.brotliCompressSync(bytes, {
          params: { [zlib.constants.BROTLI_PARAM_QUALITY]: WS_OUTPUT_BROTLI_QUALITY },
        })
      : zlib.gzipSync(bytes, { level: WS_OUTPUT_GZIP_LEVEL });
  }

  private frameWithHeader(header: number, payload: Uint8Array<ArrayBuffer>): Buffer<ArrayBuffer> {
    const out = Buffer.allocUnsafe(1 + payload.length);
    out[0] = header;
    out.set(payload, 1);
    return out;
  }

  // 5-byte header for the context-takeover mode: 0x03 + 4-byte LE raw size, so
  // the client can size-delimit a frame out of the persistent DecompressionStream
  // (which doesn't end per frame and emits in arbitrary 16KB chunks).
  private frameWithCtxHeader(
    compressed: Uint8Array<ArrayBuffer>,
    rawSize: number,
  ): Buffer<ArrayBuffer> {
    const out = Buffer.allocUnsafe(WS_OUTPUT_CTX_HEADER_BYTES + compressed.length);
    out[0] = WS_OUTPUT_BROTLI_CTX;
    out.writeUInt32LE(rawSize, 1);
    out.set(compressed, WS_OUTPUT_CTX_HEADER_BYTES);
    return out;
  }

  // Chain an output-frame send onto the client's per-client FIFO. In "br-ctx"
  // mode the persistent Brotli flush resolves asynchronously (a tick or more
  // after the frame was queued), while sub-threshold frames skip compression —
  // a synchronous send there would jump the wire queue and deliver bytes out
  // of PTY order (mid-escape-sequence splices painted as garbage rows during
  // fast full-screen redraws). Every br-ctx frame — raw or compressed — goes
  // through this chain so wire order always equals PTY order. Errors (encoder
  // released mid-flight on detach/re-promote) drop the frame, matching the
  // previous behavior, and never wedge the chain.
  private enqueueOrderedSend(
    client: ManagedClient,
    task: () => Promise<void> | void,
  ): Promise<void> {
    const send = client.outputSendChain.then(task).catch(() => undefined);
    client.outputSendChain = send;
    return send;
  }

  private enqueueBrotliCtxFrame(
    client: ManagedClient,
    ws: ClientSocket,
    bytes: Uint8Array<ArrayBuffer>,
  ): Promise<void> {
    if (bytes.length < WS_OUTPUT_COMPRESS_THRESHOLD_BYTES) {
      const frame = this.frameWithHeader(WS_OUTPUT_RAW, bytes);
      return this.enqueueOrderedSend(client, () => {
        this.sendOutputBytes(ws, frame);
      });
    }
    const encoder = client.brotliEncoder;
    if (!encoder) return Promise.resolve();
    return this.enqueueOrderedSend(client, async () => {
      const compressed = await encoder.flush(bytes);
      this.sendOutputBytes(ws, this.frameWithCtxHeader(compressed, bytes.length));
    });
  }

  async sendOutputFrame(
    ws: ClientSocket,
    bytes: Uint8Array<ArrayBuffer>,
    client: ManagedClient,
  ): Promise<void> {
    const mode = client.compressMode;
    if (mode === null) {
      this.sendOutputBytes(ws, bytes);
      return;
    }
    if (mode === "br-ctx") {
      await this.enqueueBrotliCtxFrame(client, ws, bytes);
      return;
    }
    if (bytes.length < WS_OUTPUT_COMPRESS_THRESHOLD_BYTES) {
      this.sendOutputBytes(ws, this.frameWithHeader(WS_OUTPUT_RAW, bytes));
      return;
    }
    const compressed = this.compressPayload(bytes, mode);
    this.sendOutputBytes(
      ws,
      this.frameWithHeader(mode === "br" ? WS_OUTPUT_BROTLI : WS_OUTPUT_GZIP, compressed),
    );
  }

  broadcastBytes(managed: ManagedSession, bytes: Uint8Array<ArrayBuffer>): void {
    if (bytes.length === 0) return;
    const compressible = bytes.length >= WS_OUTPUT_COMPRESS_THRESHOLD_BYTES;
    let brotli: Buffer<ArrayBuffer> | null = null;
    let gzip: Buffer<ArrayBuffer> | null = null;
    for (const client of managed.clients) {
      if (client.pending) {
        if (client.pendingOverflowed) continue;
        if (client.pendingBytesLength + bytes.byteLength > WS_PENDING_CLIENT_MAX_BYTES) {
          this.overflowPendingClient(client);
          continue;
        }
        client.pendingBytes.push(bytes);
        client.pendingBytesLength += bytes.byteLength;
        continue;
      }
      const mode = client.compressMode;
      if (mode === null) {
        this.sendOutputBytes(client.ws, bytes);
        continue;
      }
      if (mode === "br-ctx") {
        // Per-client persistent stream: fire-and-forget onto the client's
        // ordered send chain. The chain — not just the encoder's internal
        // FIFO — carries sub-threshold raw frames too, so a small frame
        // arriving right after a large one can't hit the wire first while the
        // large one is still compressing (the out-of-order splice that painted
        // garbage rows during fast scrolling). sendOutputBytes still checks
        // readyState/backpressure at send time.
        void this.enqueueBrotliCtxFrame(client, client.ws, bytes);
        continue;
      }
      if (!compressible) {
        this.sendOutputBytes(client.ws, this.frameWithHeader(WS_OUTPUT_RAW, bytes));
        continue;
      }
      if (mode === "br") {
        if (brotli === null) brotli = this.compressPayload(bytes, "br");
        this.sendOutputBytes(client.ws, this.frameWithHeader(WS_OUTPUT_BROTLI, brotli));
      } else {
        if (gzip === null) gzip = this.compressPayload(bytes, "gzip");
        this.sendOutputBytes(client.ws, this.frameWithHeader(WS_OUTPUT_GZIP, gzip));
      }
    }
  }

  sendToClient(client: ManagedClient, payload: ServerToClientMessage): void {
    if (client.pending) {
      if (client.pendingOverflowed) return;
      if (client.pendingControl.length >= WS_PENDING_CLIENT_MAX_CONTROL_MESSAGES) {
        this.overflowPendingClient(client);
        return;
      }
      client.pendingControl.push(payload);
      return;
    }
    this.sendControl(client.ws, payload);
  }

  private overflowPendingClient(client: ManagedClient): void {
    client.pendingOverflowed = true;
    client.pendingControl = [];
    client.pendingBytes = [];
    client.pendingBytesLength = 0;
    try {
      client.ws.close(WS_CLOSE_BACKPRESSURE, "pending client backpressure");
    } catch {
      return;
    }
  }

  broadcast(managed: ManagedSession, payload: ServerToClientMessage): void {
    for (const client of managed.clients) this.sendToClient(client, payload);
  }
}
