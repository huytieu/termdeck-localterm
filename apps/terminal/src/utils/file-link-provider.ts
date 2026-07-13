import type { ILink, ILinkProvider, Terminal } from "@xterm/xterm";

export interface FileLinkMatch {
  path: string;
  line: number | null;
  column: number | null;
}

type OpenFileHandler = (match: FileLinkMatch) => void;

// A single logical line can wrap across many buffer rows (minified output,
// `cat` of a long file). Cap how far the group scan walks so hovering a row of
// pathological output stays O(viewport) instead of O(scrollback).
const MAX_WRAPPED_ROWS = 24;

const OPEN_WRAPPERS = new Set(['"', "'", "`", "(", "[", "{", "<"]);
// Trailing punctuation that belongs to prose around a path, not the path
// itself ("see src/foo.ts.", "(in lib/bar.py)").
const TRAILING_PUNCTUATION = new Set(['"', "'", "`", ")", "]", "}", ">", ",", ";", "!", "?", "."]);

const LINE_COLUMN_SUFFIX = /((?::\d+){1,2})$/;
const LAST_SEGMENT_HAS_EXTENSION = /\.[A-Za-z0-9]+$/;

interface TokenAnalysis {
  // Offset of the linkified span within the analyzed token.
  start: number;
  // Length of the linkified span (path plus any :line:col suffix).
  length: number;
  match: FileLinkMatch;
}

// Decides whether a whitespace-delimited token contains something worth
// treating as a file path. Deliberately conservative for bare relative tokens
// (requires an extension) so prose like "and/or" or dates like 07/13 never
// linkify, while `04-projects/notes/plan.md`, `./scripts/run.sh`,
// `~/Downloads`, `/etc/hosts` and `src/index.ts:42:7` all do.
export const analyzeToken = (token: string): TokenAnalysis | null => {
  let start = 0;
  let end = token.length;

  while (start < end && OPEN_WRAPPERS.has(token[start])) start++;
  while (end > start && TRAILING_PUNCTUATION.has(token[end - 1])) end--;
  if (end - start < 2) return null;

  const candidate = token.slice(start, end);
  // URLs are WebLinksAddon's job; also skips scheme-ish tokens like git@host:…
  if (candidate.includes("://")) return null;

  let core = candidate;
  let line: number | null = null;
  let column: number | null = null;
  const suffixMatch = LINE_COLUMN_SUFFIX.exec(candidate);
  if (suffixMatch) {
    core = candidate.slice(0, suffixMatch.index);
    const parts = suffixMatch[1].split(":");
    line = Number.parseInt(parts[1], 10) || null;
    column = parts[2] ? Number.parseInt(parts[2], 10) || null : null;
  }
  // A stray trailing colon ("path/file.md:") is prose, not a suffix.
  while (core.endsWith(":")) core = core.slice(0, -1);
  if (core.length < 2) return null;

  const isAnchored =
    core.startsWith("/") || core.startsWith("~/") || core.startsWith("./") || core.startsWith("../");

  if (core.includes("/")) {
    if (!isAnchored) {
      const lastSegment = core.slice(core.lastIndexOf("/") + 1);
      if (!LAST_SEGMENT_HAS_EXTENSION.test(lastSegment)) return null;
    }
  } else {
    // No slash at all: only trust it with both an extension and a :line
    // suffix ("index.ts:42"), the classic compiler-diagnostic shape.
    if (line === null || !LAST_SEGMENT_HAS_EXTENSION.test(core)) return null;
  }
  if (core === "/" || core === "~/") return null;

  return {
    start,
    length: core.length + (suffixMatch ? candidate.length - suffixMatch.index : 0),
    match: { path: core, line, column },
  };
};

interface CellPosition {
  x: number;
  y: number;
}

// Turns file-path-looking tokens in terminal output into clickable links.
// Purely lexical: no filesystem checks on hover (the preview surface reports
// "not found" for false positives). Relative paths are resolved against the
// session cwd by the endpoint the click handler calls, not here.
export class FileLinkProvider implements ILinkProvider {
  constructor(
    private readonly terminal: Terminal,
    private readonly onOpen: OpenFileHandler,
  ) {}

  provideLinks(bufferLineNumber: number, callback: (links: ILink[] | undefined) => void): void {
    const buffer = this.terminal.buffer.active;
    const requestedRow = bufferLineNumber - 1;
    if (!buffer.getLine(requestedRow)) return callback(undefined);

    // Expand to the full wrapped-line group containing the requested row so a
    // path split across visual rows still matches as one string.
    let startRow = requestedRow;
    while (
      startRow > 0 &&
      requestedRow - startRow < MAX_WRAPPED_ROWS &&
      buffer.getLine(startRow)?.isWrapped
    ) {
      startRow--;
    }
    let endRow = requestedRow;
    while (
      endRow + 1 < buffer.length &&
      endRow - startRow < MAX_WRAPPED_ROWS &&
      buffer.getLine(endRow + 1)?.isWrapped
    ) {
      endRow++;
    }

    // Build the unwrapped text with a per-UTF-16-unit map back to buffer
    // cells, so match offsets convert exactly to link ranges (wide chars and
    // grapheme clusters occupy one map entry per string unit).
    let text = "";
    const cellMap: CellPosition[] = [];
    for (let y = startRow; y <= endRow; y++) {
      const bufferLine = buffer.getLine(y);
      if (!bufferLine) break;
      for (let x = 0; x < bufferLine.length; x++) {
        const cell = bufferLine.getCell(x);
        if (!cell) continue;
        const width = cell.getWidth();
        const chars = cell.getChars();
        if (chars === "" && width === 0) continue; // wide-char tail cell
        const content = chars === "" ? " " : chars;
        for (const unit of content) {
          text += unit;
          cellMap.push({ x: x + 1, y: y + 1 });
        }
      }
    }

    const links: ILink[] = [];
    const tokenPattern = /\S+/g;
    let tokenMatch = tokenPattern.exec(text);
    while (tokenMatch !== null) {
      const analysis = analyzeToken(tokenMatch[0]);
      if (analysis) {
        const startOffset = tokenMatch.index + analysis.start;
        const endOffset = startOffset + analysis.length - 1;
        const startCell = cellMap[startOffset];
        const endCell = cellMap[endOffset];
        if (startCell && endCell) {
          const { match } = analysis;
          links.push({
            range: { start: startCell, end: endCell },
            text: match.path,
            decorations: { pointerCursor: true, underline: true },
            activate: () => this.onOpen(match),
          });
        }
      }
      tokenMatch = tokenPattern.exec(text);
    }

    callback(links.length > 0 ? links : undefined);
  }
}
