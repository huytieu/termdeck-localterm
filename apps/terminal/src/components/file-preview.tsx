import { Copy, FileCode, FileText, Folder, FolderOpen, SquarePen, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { currentTheme, subscribeTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  COMMAND_PALETTE_BACKDROP_CLASSES,
  COMMAND_PALETTE_PANEL_CLASSES,
  MODAL_PANEL_CLASSES,
} from "@/lib/animation-classes";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/markdown";
import { buildMediaUrl } from "@/utils/build-media-url";
import { revealFileLocation } from "@/utils/reveal-file";
import {
  detectLangId,
  tokenizeDiffLines,
  type SyntaxLine,
} from "@/utils/syntax-highlight";

export interface FilePreviewTarget {
  path: string;
  line: number | null;
}

interface DirectoryEntry {
  name: string;
  isDirectory: boolean;
}

export type FilePreviewContent =
  | { kind: "text"; path: string; size: number; truncated: boolean; content: string }
  | { kind: "image"; path: string; size: number; dataUrl: string }
  | { kind: "video"; path: string; size: number }
  | { kind: "binary"; path: string; size: number }
  | { kind: "directory"; path: string; entries: DirectoryEntry[]; truncated: boolean };

export type FileTextResponse = FilePreviewContent | { error: string };

interface FilePreviewModalProps {
  open: boolean;
  cwd: string | null;
  target: FilePreviewTarget | null;
  onClose: () => void;
  onOpenInEditor: (path: string, line: number | null) => void;
}

export const isMarkdownPath = (filePath: string): boolean => /\.(md|mdx|markdown)$/i.test(filePath);

export const isVideoPath = (filePath: string): boolean =>
  /\.(mp4|m4v|webm|ogv|ogg|mov)$/i.test(filePath);

export const formatSize = (size: number): string => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

export const ERROR_MESSAGES: Record<string, string> = {
  invalid_cwd: "The session's working directory is gone.",
  invalid_path: "That path can't be previewed.",
  not_found: "File not found.",
  unreadable: "The file exists but couldn't be read.",
};

// Syntax-highlighted read-only source pane with line numbers. Highlights and
// scrolls to `focusLine` (1-based) when set — the `:42` suffix of a clicked
// compiler diagnostic.
export const SourceView = ({
  path,
  content,
  focusLine,
}: {
  path: string;
  content: string;
  focusLine: number | null;
}) => {
  const [tokenLines, setTokenLines] = useState<readonly SyntaxLine[] | null>(null);
  const focusRef = useRef<HTMLDivElement | null>(null);
  const lines = content.split("\n");
  // Re-tokenize when the theme flips so syntax colors match light/dark.
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => "dark" as const);

  useEffect(() => {
    let cancelled = false;
    setTokenLines(null);
    const langId = detectLangId(path);
    if (!langId) return;
    void tokenizeDiffLines(path, content.split("\n"), langId, theme).then((result) => {
      if (!cancelled) setTokenLines(result);
    });
    return () => {
      cancelled = true;
    };
  }, [path, content, theme]);

  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: "center" });
  }, [path, tokenLines]);

  const gutterWidth = `${String(lines.length).length}ch`;

  return (
    <div className="min-w-max font-mono text-xs leading-relaxed">
      {lines.map((lineText, index) => {
        const lineNumber = index + 1;
        const isFocus = focusLine === lineNumber;
        const tokens = tokenLines?.[index]?.tokens;
        return (
          <div
            key={lineNumber}
            ref={isFocus ? focusRef : undefined}
            className={cn("flex px-4", isFocus && "bg-amber-400/15")}
          >
            <span
              className="mr-3 shrink-0 select-none text-right text-muted-foreground/70 tabular-nums"
              style={{ width: gutterWidth }}
            >
              {lineNumber}
            </span>
            <span className="whitespace-pre">
              {tokens
                ? tokens.map((token, tokenIndex) => (
                    <span
                      key={tokenIndex}
                      style={{
                        color: token.color || undefined,
                        fontStyle: token.fontStyle & 1 ? "italic" : undefined,
                      }}
                    >
                      {token.content}
                    </span>
                  ))
                : lineText || " "}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// Full-screen preview for a file path clicked in terminal output. Fetches
// content from /api/file/text (JSON only — see the endpoint's XSS note) and
// renders by kind: markdown (rendered, toggleable to source), code (shiki),
// images (data URL), directories (navigable listing).
export const FilePreviewModal = ({
  open,
  cwd,
  target,
  onClose,
  onOpenInEditor,
}: FilePreviewModalProps) => {
  const [mounted, setMounted] = useState(false);
  const [settled, setSettled] = useState(false);
  const [currentTarget, setCurrentTarget] = useState<FilePreviewTarget | null>(null);
  const [result, setResult] = useState<FilePreviewContent | null>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const [showMarkdownSource, setShowMarkdownSource] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setCurrentTarget(target);
      setShowMarkdownSource(target?.line != null);
      setCopied(false);
      const frame = requestAnimationFrame(() => setSettled(true));
      return () => cancelAnimationFrame(frame);
    }
    setSettled(false);
    const timeout = window.setTimeout(() => {
      setMounted(false);
      setCurrentTarget(null);
      setResult(null);
      setFailureMessage(null);
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [open, target]);

  useEffect(() => {
    if (!currentTarget || !cwd) return;
    let cancelled = false;
    setResult(null);
    setFailureMessage(null);
    const url = new URL("/api/file/text", window.location.href);
    url.searchParams.set("cwd", cwd);
    url.searchParams.set("path", currentTarget.path);
    void fetch(url)
      .then(async (response) => {
        const body = (await response.json()) as FileTextResponse;
        if (cancelled) return;
        if ("error" in body) {
          setFailureMessage(ERROR_MESSAGES[body.error] ?? "Preview failed.");
        } else {
          setResult(body);
        }
      })
      .catch(() => {
        if (!cancelled) setFailureMessage("Preview failed: the daemon didn't respond.");
      });
    return () => {
      cancelled = true;
    };
  }, [currentTarget, cwd]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const copyPath = useCallback(() => {
    const resolved = result?.path ?? currentTarget?.path;
    if (!resolved) return;
    void navigator.clipboard.writeText(resolved).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  }, [result, currentTarget]);

  if (!mounted || !currentTarget) return null;

  const isVisible = open && settled;
  const resolvedPath = result?.path ?? currentTarget.path;
  const lastSlash = resolvedPath.lastIndexOf("/");
  const directoryPart = lastSlash > 0 ? resolvedPath.slice(0, lastSlash + 1) : "";
  const basename = resolvedPath.slice(lastSlash + 1);
  const markdown = result?.kind === "text" && isMarkdownPath(result.path);
  const isEditableFile = result?.kind === "text" || result?.kind === "binary";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
      <div
        data-open={isVisible || undefined}
        data-closed={!isVisible || undefined}
        className={cn(COMMAND_PALETTE_BACKDROP_CLASSES)}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="file preview"
        aria-modal
        data-open={isVisible || undefined}
        data-closed={!isVisible || undefined}
        className={cn(
          "relative z-10 flex h-full w-[900px] max-w-full flex-col overflow-hidden rounded-xl origin-center",
          MODAL_PANEL_CLASSES,
          COMMAND_PALETTE_PANEL_CLASSES,
        )}
      >
        <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2.5">
          {result?.kind === "directory" ? (
            <Folder className="size-4 shrink-0 text-muted-foreground/60" />
          ) : markdown ? (
            <FileText className="size-4 shrink-0 text-muted-foreground/60" />
          ) : (
            <FileCode className="size-4 shrink-0 text-muted-foreground/60" />
          )}
          <div className="min-w-0 flex-1 truncate font-mono text-xs" title={resolvedPath}>
            <span className="text-muted-foreground/60">{directoryPart}</span>
            <span className="text-foreground">{basename}</span>
            {currentTarget.line != null && (
              <span className="text-muted-foreground/60">:{currentTarget.line}</span>
            )}
          </div>
          {result && result.kind !== "directory" && (
            <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/60">
              {formatSize(result.size)}
            </span>
          )}
          {markdown && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 font-mono text-[11px]"
              onClick={() => setShowMarkdownSource((value) => !value)}
            >
              {showMarkdownSource ? "rendered" : "source"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            aria-label="copy path"
            onClick={copyPath}
          >
            {copied ? <span className="font-mono text-[11px]">copied</span> : <Copy className="size-3.5" />}
          </Button>
          {result && result.kind !== "directory" && cwd && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              aria-label="reveal in file manager"
              title="Reveal the real file in Finder"
              onClick={() => void revealFileLocation(cwd, resolvedPath)}
            >
              <FolderOpen className="size-3.5" />
            </Button>
          )}
          {isEditableFile && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              aria-label="open in editor"
              onClick={() => onOpenInEditor(resolvedPath, currentTarget.line)}
            >
              <SquarePen className="size-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 px-2" aria-label="close" onClick={onClose}>
            <X className="size-3.5" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {failureMessage ? (
            <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
              {failureMessage}
            </div>
          ) : !result ? (
            <div className="flex h-full items-center justify-center p-8">
              <Spinner className="size-4" aria-label="loading file" />
            </div>
          ) : result.kind === "text" ? (
            <>
              {result.truncated && (
                <div className="border-b border-border/40 bg-amber-400/10 px-4 py-1.5 font-mono text-[11px] text-amber-200/90">
                  Large file: showing the first {formatSize(1024 * 1024)}.
                </div>
              )}
              {markdown && !showMarkdownSource ? (
                <div className="wiki-prose mx-auto max-w-[710px] px-5 py-4 text-[15px]">
                  <Markdown sourcePath={result.path}>{result.content}</Markdown>
                </div>
              ) : (
                <div className="py-3">
                  <SourceView
                    path={result.path}
                    content={result.content}
                    focusLine={currentTarget.line}
                  />
                </div>
              )}
            </>
          ) : result.kind === "image" ? (
            <div className="flex h-full items-center justify-center p-6">
              <img
                src={result.dataUrl}
                alt={basename}
                className="max-h-full max-w-full rounded border border-border/40 object-contain"
              />
            </div>
          ) : result.kind === "video" ? (
            <div className="flex h-full items-center justify-center p-6">
              <video
                src={cwd ? buildMediaUrl(cwd, result.path) : undefined}
                controls
                playsInline
                className="max-h-full max-w-full rounded border border-border/40 bg-black object-contain"
              />
            </div>
          ) : result.kind === "binary" ? (
            <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
              Binary file ({formatSize(result.size)}) — no preview.
            </div>
          ) : (
            <div className="py-2">
              {result.truncated && (
                <div className="px-4 py-1.5 font-mono text-[11px] text-muted-foreground/60">
                  Showing the first {result.entries.length} entries.
                </div>
              )}
              {result.entries.map((entry) => (
                <button
                  key={entry.name}
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-1 text-left font-mono text-xs hover:bg-muted/40"
                  onClick={() =>
                    setCurrentTarget({
                      path: `${result.path}/${entry.name}`,
                      line: null,
                    })
                  }
                >
                  {entry.isDirectory ? (
                    <Folder className="size-3.5 shrink-0 text-muted-foreground/60" />
                  ) : (
                    <FileCode className="size-3.5 shrink-0 text-muted-foreground/40" />
                  )}
                  <span className={cn(entry.isDirectory ? "text-foreground" : "text-muted-foreground")}>
                    {entry.name}
                    {entry.isDirectory ? "/" : ""}
                  </span>
                </button>
              ))}
              {result.entries.length === 0 && (
                <div className="px-4 py-6 text-center font-mono text-xs text-muted-foreground/60">
                  empty directory
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
