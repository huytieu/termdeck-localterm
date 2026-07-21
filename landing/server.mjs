// Minimal static server for the TermDeck product page (termdeck.huytieu.com).
// Serves this directory only; no deps, no framework — Railway runs `node server.mjs`.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT ?? 8080);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".gif": "image/gif",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\.])+/, "");
    if (path === "" || path === "/") path = "index.html";
    const file = join(root, path);
    if (!file.startsWith(root)) throw new Error("traversal");
    const body = await readFile(file);
    const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
    // Media is content-hashed by name changes rarely; a day of caching is plenty.
    const cache = file.endsWith(".html") ? "no-cache" : "public, max-age=86400";
    res.writeHead(200, { "content-type": type, "cache-control": cache });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  }
}).listen(port, () => console.log(`termdeck landing on :${port}`));
