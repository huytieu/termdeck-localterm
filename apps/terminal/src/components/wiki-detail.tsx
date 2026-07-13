import { useCallback, useEffect, useRef, useState } from "react";
import { File, FileText, Folder, Globe, Pencil, Sparkles, SquareTerminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Markdown } from "@/components/markdown";
import { openSession, openWikiFile } from "@/hooks/use-shell";
import { createSession, createAiSessionFromWiki } from "@/lib/deck-session";
import {
  ERROR_MESSAGES,
  SourceView,
  formatSize,
  isMarkdownPath,
  type FilePreviewContent,
  type FileTextResponse,
} from "@/components/file-preview";

const isHtmlPath = (p: string): boolean => /\.html?$/i.test(p);

const dirOf = (p: string): string =>
  p.startsWith("/") ? p.slice(0, p.lastIndexOf("/")) || "/" : "/";

interface Frontmatter {
  fields: { key: string; value: string }[];
  body: string;
}

// Split a leading YAML frontmatter block (`---` … `---`) from the markdown body.
// react-markdown otherwise renders the block as a thematic break + a run-on
// paragraph; we lift it into a metadata card instead. Intentionally shallow: one
// `key: value` per line, quotes stripped, `[a, b]` flattened — enough for the
// common note/blog frontmatter, not a full YAML parser.
const parseFrontmatter = (raw: string): Frontmatter => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return { fields: [], body: raw };
  const fields: { key: string; value: string }[] = [];
  for (const line of match[1].split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    if (!key) continue;
    let value = line.slice(colon + 1).trim();
    value = value.replace(/^["']|["']$/g, "");
    value = value.replace(/^\[(.*)\]$/, (_m, inner) =>
      inner
        .split(",")
        .map((s: string) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean)
        .join(", "),
    );
    fields.push({ key, value });
  }
  return { fields, body: raw.slice(match[0].length) };
};

const FrontmatterCard = ({ fields }: { fields: { key: string; value: string }[] }) => {
  if (fields.length === 0) return null;
  const title = fields.find((f) => f.key.toLowerCase() === "title")?.value;
  const rest = fields.filter((f) => f.key.toLowerCase() !== "title");
  return (
    <div className="mb-4 rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
      {title ? (
        <div className="mb-2 font-sans text-base font-semibold leading-snug text-foreground">
          {title}
        </div>
      ) : null}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {rest.map((f) => (
          <div key={f.key} className="contents">
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
              {f.key}
            </dt>
            <dd className="min-w-0 break-words text-[11px] text-foreground/90">{f.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

// Floating "Ask AI" popover shown over a text selection in the rendered/source
// view. The user types a prompt; on submit a Claude Code session spawns in the
// file's directory seeded with the prompt + the selected text.
const AiSelectionPopover = ({
  path,
  selection,
  anchor,
  onClose,
}: {
  path: string;
  selection: string;
  anchor: { top: number; left: number };
  onClose: () => void;
}) => {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createAiSessionFromWiki({ path, selection, prompt: trimmed });
      onClose();
      openSession(id);
    } catch {
      setBusy(false);
      setError("Couldn't start the session.");
    }
  };

  return (
    <div
      className="fixed z-50 w-80 rounded-lg border border-border bg-popover p-2 shadow-lg"
      style={{ top: Math.min(anchor.top + 6, window.innerHeight - 140), left: Math.min(anchor.left, window.innerWidth - 340) }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-medium text-muted-foreground">
        <Sparkles className="size-3.5 text-accent-foreground" />
        Start an AI session on the selection
      </div>
      <input
        ref={inputRef}
        value={prompt}
        placeholder="What should the agent do with it?"
        aria-label="ai prompt"
        className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-xs outline-none focus:border-ring"
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") onClose();
        }}
      />
      {error ? <div className="mt-1 px-1 text-[10px] text-amber-400">{error}</div> : null}
      <div className="mt-1.5 flex items-center justify-between gap-2 px-1">
        <span className="truncate text-[10px] text-muted-foreground/60">
          {selection.length} chars selected
        </span>
        <Button size="xs" disabled={busy || !prompt.trim()} onClick={() => void submit()}>
          {busy ? <Spinner className="size-3" /> : <Sparkles className="size-3" />}
          Run
        </Button>
      </div>
    </div>
  );
};

// Wiki-mode detail pane: renders the selected vault file natively. Markdown and
// HTML render by default with an opt-in source view; other text files show the
// syntax-highlighted source. Any text file can be edited in place (saved via
// PUT /api/file/text). A terminal can be opened in the file's directory, and a
// text selection can seed a Claude Code session.
export const WikiDetail = ({ path, line }: { path: string; line: number | null }) => {
  const [result, setResult] = useState<FilePreviewContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [ai, setAi] = useState<{ selection: string; anchor: { top: number; left: number } } | null>(
    null,
  );

  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError(null);
    setShowSource(line !== null); // a search hit lands on the source at its line
    setEditing(false);
    setAi(null);
    const cwd = dirOf(path);
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
  }, [path, line, reloadTick]);

  const basename = path.slice(path.lastIndexOf("/") + 1);
  const isText = result?.kind === "text";
  const markdown = isText && isMarkdownPath(result.path);
  const html = isText && isHtmlPath(result.path);
  // Markdown/HTML render by default; other text files are source-only.
  const renderable = markdown || html;

  const startEdit = () => {
    if (!isText) return;
    setDraft(result.content);
    setEditing(true);
    setAi(null);
  };

  const save = async () => {
    if (!isText || saving) return;
    setSaving(true);
    setSaveError(null);
    const url = new URL("/api/file/text", window.location.href);
    url.searchParams.set("cwd", dirOf(path));
    url.searchParams.set("path", path);
    try {
      const response = await fetch(url, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: draft }),
      });
      if (!response.ok) {
        setSaving(false);
        setSaveError(`Save failed (${response.status}).`);
        return;
      }
      // Post-condition: re-read the file so the rendered view reflects disk.
      setSaving(false);
      setEditing(false);
      setReloadTick((t) => t + 1);
    } catch {
      setSaving(false);
      setSaveError("Save failed: the daemon didn't respond.");
    }
  };

  const openTerminalHere = () => {
    void createSession(dirOf(path)).then(openSession);
  };

  // Capture a text selection inside the rendered/source view to anchor the AI popover.
  const onBodyMouseUp = useCallback(() => {
    const sel = window.getSelection();
    const text = sel?.toString() ?? "";
    if (text.trim().length === 0 || !sel || sel.rangeCount === 0) {
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setAi({ selection: text, anchor: { top: rect.bottom, left: rect.left } });
  }, []);

  // Dismiss the AI popover on an outside mousedown.
  useEffect(() => {
    if (!ai) return;
    const onDown = () => setAi(null);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [ai]);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-4">
        {result?.kind === "directory" ? (
          <Folder className="size-4 shrink-0 text-muted-foreground/60" />
        ) : html ? (
          <Globe className="size-4 shrink-0 text-muted-foreground/60" />
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

        {editing ? (
          <>
            {saveError && (
              <span className="shrink-0 font-mono text-[10px] text-amber-400">{saveError}</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 font-mono text-[11px]"
              onClick={() => setEditing(false)}
            >
              cancel
            </Button>
            <Button
              size="sm"
              className="h-7 px-2 font-mono text-[11px]"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? <Spinner className="size-3" /> : null}
              save
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="open terminal here"
              title="Open a terminal in this file's folder"
              onClick={openTerminalHere}
            >
              <SquareTerminal className="size-3.5" />
            </Button>
            {isText && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="edit file"
                title="Edit"
                onClick={startEdit}
              >
                <Pencil className="size-3.5" />
              </Button>
            )}
            {renderable && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 font-mono text-[11px]"
                onClick={() => setShowSource((v) => !v)}
              >
                {showSource ? "rendered" : "source"}
              </Button>
            )}
          </>
        )}
      </div>

      <div
        className="min-h-0 flex-1 overflow-auto"
        onMouseUp={editing ? undefined : onBodyMouseUp}
      >
        {error ? (
          <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
            {error}
          </div>
        ) : !result ? (
          <div className="flex h-full items-center justify-center p-8">
            <Spinner className="size-4" aria-label="loading file" />
          </div>
        ) : editing && isText ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            className="h-full w-full resize-none bg-background p-4 font-mono text-xs leading-relaxed text-foreground outline-none"
          />
        ) : result.kind === "text" ? (
          html && !showSource ? (
            <iframe
              // Vault-owned HTML rendered in a null-origin sandbox: scripts run
              // (Tailwind CDN etc.) but it can't touch the app origin.
              title={basename}
              srcDoc={result.content}
              sandbox="allow-scripts allow-popups allow-forms"
              className="h-full w-full border-0 bg-white"
            />
          ) : markdown && !showSource ? (
            (() => {
              const { fields, body } = parseFrontmatter(result.content);
              return (
                <div className="mx-auto max-w-3xl px-6 py-5 font-mono text-xs">
                  <FrontmatterCard fields={fields} />
                  <Markdown>{body}</Markdown>
                </div>
              );
            })()
          ) : (
            <div className="py-3">
              <SourceView path={result.path} content={result.content} focusLine={line} />
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

      {ai ? (
        <AiSelectionPopover
          path={path}
          selection={ai.selection}
          anchor={ai.anchor}
          onClose={() => setAi(null)}
        />
      ) : null}
    </div>
  );
};
