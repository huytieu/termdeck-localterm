import { useEffect, useState } from "react";
import { File, FileText, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Markdown } from "@/components/markdown";
import { openWikiFile } from "@/hooks/use-shell";
import {
  ERROR_MESSAGES,
  SourceView,
  formatSize,
  isMarkdownPath,
  type FilePreviewContent,
  type FileTextResponse,
} from "@/components/file-preview";

// Wiki-mode detail pane: renders the selected vault file natively via the same
// /api/file/text endpoint + renderers the terminal file-preview modal uses
// (markdown, shiki source, images, directory listings). No embedded second app.
export const WikiDetail = ({ path }: { path: string }) => {
  const [result, setResult] = useState<FilePreviewContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError(null);
    setShowSource(false);
    // Absolute path -> its directory; anything else (e.g. a ~/… path the server
    // expands) -> "/", a valid cwd since the path itself carries the location.
    const cwd = path.startsWith("/") ? path.slice(0, path.lastIndexOf("/")) || "/" : "/";
    const url = new URL("/api/file/text", window.location.href);
    url.searchParams.set("cwd", cwd);
    url.searchParams.set("path", path);
    void fetch(url, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as FileTextResponse;
        if (controller.signal.aborted) return;
        if ("error" in body) setError(ERROR_MESSAGES[body.error] ?? "Preview failed.");
        else setResult(body);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Preview failed: the daemon didn't respond.");
      });
    return () => controller.abort();
  }, [path]);

  const basename = path.slice(path.lastIndexOf("/") + 1);
  const markdown = result?.kind === "text" && isMarkdownPath(result.path);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-4">
        {result?.kind === "directory" ? (
          <Folder className="size-4 shrink-0 text-muted-foreground/60" />
        ) : markdown ? (
          <FileText className="size-4 shrink-0 text-muted-foreground/60" />
        ) : (
          <File className="size-4 shrink-0 text-muted-foreground/60" />
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={path}>
          {basename}
        </span>
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
            onClick={() => setShowSource((v) => !v)}
          >
            {showSource ? "rendered" : "source"}
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {error ? (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">{error}</div>
        ) : !result ? (
          <div className="flex h-full items-center justify-center p-8">
            <Spinner className="size-4" aria-label="loading file" />
          </div>
        ) : result.kind === "text" ? (
          markdown && !showSource ? (
            <div className="mx-auto max-w-3xl px-6 py-5 font-mono text-xs">
              <Markdown>{result.content}</Markdown>
            </div>
          ) : (
            <div className="py-3">
              <SourceView path={result.path} content={result.content} focusLine={null} />
            </div>
          )
        ) : result.kind === "image" ? (
          <div className="flex h-full items-center justify-center p-6">
            <img
              src={result.dataUrl}
              alt={basename}
              className="max-h-full max-w-full rounded border border-border/40 object-contain"
            />
          </div>
        ) : result.kind === "binary" ? (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
            Binary file ({formatSize(result.size)}) — no preview.
          </div>
        ) : (
          <div className="py-2">
            {result.entries.map((entry) => (
              <button
                key={entry.name}
                type="button"
                className="flex w-full items-center gap-2 px-4 py-1 text-left font-mono text-xs hover:bg-muted/40"
                onClick={() => openWikiFile(`${result.path}/${entry.name}`)}
              >
                {entry.isDirectory ? (
                  <Folder className="size-3.5 shrink-0 text-muted-foreground/60" />
                ) : (
                  <File className="size-3.5 shrink-0 text-muted-foreground/40" />
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
  );
};
