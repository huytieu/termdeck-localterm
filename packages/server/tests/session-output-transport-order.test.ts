import zlib from "node:zlib";
import { describe, expect, it } from "vite-plus/test";
import {
  WS_OUTPUT_BROTLI_CTX,
  WS_OUTPUT_BROTLI_QUALITY,
  WS_OUTPUT_COMPRESS_THRESHOLD_BYTES,
  WS_OUTPUT_CTX_HEADER_BYTES,
  WS_OUTPUT_RAW,
} from "../src/constants.js";
import type { ManagedClient, ManagedSession } from "../src/session-manager.js";
import { makeBrotliEncoder, SessionOutputTransport } from "../src/session-output-transport.js";
import type { ClientSocket } from "../src/utils/ws-socket.js";

const makeRecordingSocket = (frames: Buffer[]): ClientSocket =>
  ({
    readyState: 1,
    bufferedAmount: 0,
    send: (bytes: Uint8Array) => {
      frames.push(Buffer.from(bytes));
    },
    close: () => {},
  }) as unknown as ClientSocket;

const makeBrCtxClient = (ws: ClientSocket): ManagedClient =>
  ({
    ws,
    pending: false,
    pendingControl: [],
    pendingBytes: [],
    pendingBytesLength: 0,
    pendingOverflowed: false,
    pendingTimer: null,
    cols: 80,
    rows: 24,
    focused: false,
    lastActivitySequence: 0,
    windowId: "",
    follow: false,
    coordinator: null,
    compressMode: "br-ctx",
    brotliEncoder: makeBrotliEncoder(WS_OUTPUT_BROTLI_QUALITY),
    outputSendChain: Promise.resolve(),
    terminalResponder: false,
  }) as unknown as ManagedClient;

describe("SessionOutputTransport br-ctx frame ordering", () => {
  it("keeps a small raw frame behind an earlier large frame still compressing", async () => {
    const transport = new SessionOutputTransport(() => {});
    const frames: Buffer[] = [];
    const ws = makeRecordingSocket(frames);
    const client = makeBrCtxClient(ws);
    const managed = { clients: new Set([client]) } as unknown as ManagedSession;

    // Large frame (compressed asynchronously) immediately followed by a small
    // frame (skips compression) — the pre-fix transport put the small frame on
    // the wire first, splicing the PTY stream out of order.
    const large = Buffer.alloc(WS_OUTPUT_COMPRESS_THRESHOLD_BYTES * 8, "A".charCodeAt(0));
    const small = Buffer.from("[?2026l");
    transport.broadcastBytes(managed, large);
    transport.broadcastBytes(managed, small);

    await client.outputSendChain;

    expect(frames).toHaveLength(2);
    expect(frames[0]?.[0]).toBe(WS_OUTPUT_BROTLI_CTX);
    expect(frames[1]?.[0]).toBe(WS_OUTPUT_RAW);
    expect(Buffer.from(frames[1]!.subarray(1)).toString("utf8")).toBe("[?2026l");
    client.brotliEncoder?.release();
  });

  it("preserves PTY order across an interleaved large/small/large burst", async () => {
    const transport = new SessionOutputTransport(() => {});
    const frames: Buffer[] = [];
    const ws = makeRecordingSocket(frames);
    const client = makeBrCtxClient(ws);
    const managed = { clients: new Set([client]) } as unknown as ManagedSession;

    const chunkA = Buffer.alloc(WS_OUTPUT_COMPRESS_THRESHOLD_BYTES * 4, "A".charCodeAt(0));
    const chunkB = Buffer.from("small-b");
    const chunkC = Buffer.alloc(WS_OUTPUT_COMPRESS_THRESHOLD_BYTES * 4, "C".charCodeAt(0));
    const chunkD = Buffer.from("small-d");
    for (const chunk of [chunkA, chunkB, chunkC, chunkD]) {
      transport.broadcastBytes(managed, chunk);
    }

    await client.outputSendChain;

    expect(frames.map((frame) => frame[0])).toEqual([
      WS_OUTPUT_BROTLI_CTX,
      WS_OUTPUT_RAW,
      WS_OUTPUT_BROTLI_CTX,
      WS_OUTPUT_RAW,
    ]);
    // Reassemble the stream the client would see and confirm it equals the
    // original PTY byte order.
    const decompress = zlib.createBrotliDecompress();
    const decodedChunks: Buffer[] = [];
    decompress.on("data", (chunk: Buffer) => decodedChunks.push(chunk));
    const reassembled: Buffer[] = [];
    for (const frame of frames) {
      if (frame[0] === WS_OUTPUT_RAW) {
        reassembled.push(Buffer.from(frame.subarray(1)));
        continue;
      }
      const rawSize = frame.readUInt32LE(1);
      decompress.write(frame.subarray(WS_OUTPUT_CTX_HEADER_BYTES));
      await new Promise((resolve) => decompress.flush(resolve));
      const decoded = Buffer.concat(decodedChunks);
      decodedChunks.length = 0;
      expect(decoded.length).toBe(rawSize);
      reassembled.push(decoded);
    }
    expect(Buffer.concat(reassembled).equals(Buffer.concat([chunkA, chunkB, chunkC, chunkD]))).toBe(
      true,
    );
    client.brotliEncoder?.release();
  });
});
