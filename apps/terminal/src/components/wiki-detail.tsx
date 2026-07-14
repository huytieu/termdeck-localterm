import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  BookOpen,
  ChevronRight,
  File,
  FileText,
  Folder,
  FolderOpen,
  Globe,
  Link2,
  PanelRight,
  PanelRightClose,
  Pencil,
  Sparkles,
  SquareTerminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Markdown } from "@/components/markdown";
// The WYSIWYG editor pulls in the whole TipTap/ProseMirror tree (~hundreds of
// KB) but is only mounted when the user clicks Edit on a markdown file. Load it
// on demand so the default terminal/read views never pay for it up front.
const WysiwygEditor = lazy(() =>
  import("@/components/wysiwyg-editor").then((m) => ({ default: m.WysiwygEditor })),
);
import { openSession, openWikiFile } from "@/hooks/use-shell";
import { createSession, chatAboutSelection } from "@/lib/deck-session";
import {
  infoPanelOpen,
  readingMode,
  setInfoPanelOpen,
  setReadingMode,
  subscribeInfoPanel,
  subscribeReadingMode,
  toggleReadingMode,
} from "@/lib/reading-mode";

const SESSION_BASE_DIR_KEY = "termdeck:sessionBaseDir";
import { CsvView } from "@/components/csv-view";
import {
  ERROR_MESSAGES,
  SourceView,
  formatSize,
  isMarkdownPath,
  type FilePreviewContent,
  type FileTextResponse,
} from "@/components/file-preview";
import { isGithubArtifactPath, githubVirtualName } from "@/utils/github-link";
import { buildMediaUrl } from "@/utils/build-media-url";
import { revealFileLocation } from "@/utils/reveal-file";

const isHtmlPath = (p: string): boolean => /\.html?$/i.test(p);
const isCsvPath = (p: string): boolean => /\.(csv|tsv)$/i.test(p);

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

// Frontmatter key -> humanized label, for any field not covered by the
// PROPERTIES priority mapping below (e.g. `updated_at` -> `Updated At`).
const humanizeKey = (key: string): string =>
  key.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

interface PropertyRow {
  label: string;
  value: string;
}

interface Properties {
  rows: PropertyRow[];
  tags: string[] | null;
}

// Build the PROPERTIES section rows: Created / Author / Co-author / Views /
// Tags in priority order (when present), then every remaining frontmatter key
// as its own humanized row. `title` is always excluded — it's the document H1.
const buildProperties = (fields: { key: string; value: string }[]): Properties => {
  const used = new Set<string>();
  const rows: PropertyRow[] = [];

  const take = (label: string, keys: string[]): void => {
    const field = fields.find((f) => keys.includes(f.key.toLowerCase()));
    if (!field) return;
    used.add(field.key);
    rows.push({ label, value: field.value });
  };

  take("Created", ["created", "date"]);
  take("Author", ["author"]);
  take("Co-author", ["co-author", "coauthor"]);
  take("Views", ["views"]);

  const tagsField = fields.find((f) => f.key.toLowerCase() === "tags");
  const tags = tagsField
    ? tagsField.value
        .split(", ")
        .map((t) => t.trim())
        .filter(Boolean)
    : null;
  if (tagsField) used.add(tagsField.key);

  for (const f of fields) {
    if (f.key.toLowerCase() === "title" || used.has(f.key)) continue;
    rows.push({ label: humanizeKey(f.key), value: f.value });
  }

  return { rows, tags };
};

// Folder relative to the vault root in leading-slash form (e.g. `/updates/digest`).
// Falls back to the absolute directory when the root hasn't resolved yet.
const folderLabel = (path: string, vaultRoot: string | null): string => {
  const dir = dirOf(path);
  if (vaultRoot && dir.startsWith(vaultRoot)) {
    const rel = dir.slice(vaultRoot.length);
    return rel === "" ? "/" : rel.startsWith("/") ? rel : `/${rel}`;
  }
  return dir;
};

interface Stats {
  words: number;
  chars: number;
  blocks: number;
  readingTime: number;
}

const computeStats = (body: string): Stats => {
  const t = body.trim();
  const words = t ? t.split(/\s+/).length : 0;
  const chars = body.length;
  const blocks = body
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean).length;
  const readingTime = Math.max(1, Math.ceil(words / 200));
  return { words, chars, blocks, readingTime };
};

const InfoSection = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <div className="eyebrow-label mb-2.5">{label}</div>
    <div className="space-y-0">{children}</div>
  </div>
);

const InfoRow = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="flex items-baseline justify-between gap-3 py-[3px]">
    <span className="font-sans text-[14px] text-muted-foreground">{label}</span>
    <span className="font-sans text-[14px] tabular-nums text-foreground text-right">{value}</span>
  </div>
);

const TagChip = ({ tag }: { tag: string }) => (
  <span
    className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[12px] leading-none text-primary"
    style={{ background: "color-mix(in oklab, var(--primary) 12%, transparent)" }}
  >
    {tag}
  </span>
);

// Right info panel: PROPERTIES / LOCATION / STATS. Replaces the old full-width
// FrontmatterCard stacked above the body (B1) — no card border/background
// around the panel itself, it sits in the page bg; the only rule is the 1px
// left divider on the enclosing <aside>.
const InfoPanel = ({
  fields,
  path,
  body,
  vaultRoot,
}: {
  fields: { key: string; value: string }[];
  path: string;
  body: string;
  vaultRoot: string | null;
}) => {
  const { rows, tags } = useMemo(() => buildProperties(fields), [fields]);
  const stats = useMemo(() => computeStats(body), [body]);
  const folder = folderLabel(path, vaultRoot);
  const hasProperties = rows.length > 0 || (tags && tags.length > 0);

  return (
    <div className="space-y-6">
      {hasProperties && (
        <InfoSection label="Properties">
          {rows.map((r) => (
            <InfoRow key={r.label} label={r.label} value={r.value} />
          ))}
          {tags && tags.length > 0 && (
            <div className="flex items-baseline justify-between gap-3 py-[3px]">
              <span className="font-sans text-[14px] text-muted-foreground">Tags</span>
              <div className="flex flex-wrap justify-end gap-1">
                {tags.map((tag) => (
                  <TagChip key={tag} tag={tag} />
                ))}
              </div>
            </div>
          )}
        </InfoSection>
      )}
      <InfoSection label="Location">
        <InfoRow label="Folder" value={folder} />
      </InfoSection>
      <InfoSection label="Stats">
        <InfoRow label="Words" value={stats.words} />
        <InfoRow label="Characters" value={stats.chars} />
        <InfoRow label="Blocks" value={stats.blocks} />
        <InfoRow label="Reading time" value={`${stats.readingTime}m`} />
      </InfoSection>
    </div>
  );
};

// Floating "Ask AI" popover shown over a text selection in the rendered/source
// view. The user types a prompt; on submit a Claude Code session spawns in the
// file's directory seeded with the prompt + the selected text.
const AiSelectionPopover = ({
  path,
  selection,
  line,
  sourceSid,
  anchor,
  onClose,
}: {
  path: string;
  selection: string;
  line: number | null;
  sourceSid: string | null;
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
      const baseDir = window.localStorage.getItem(SESSION_BASE_DIR_KEY) || undefined;
      const { id } = await chatAboutSelection({
        sessionId: sourceSid,
        path,
        selection,
        prompt: trimmed,
        line,
        baseDir,
      });
      onClose();
      // Focus the session the chat landed in (the linked one, or the fresh spawn).
      openSession(id);
    } catch {
      setBusy(false);
      setError("Couldn't send the message.");
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
        {sourceSid ? "Chat about this in the linked session" : "Start an AI session on the selection"}
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
          {selection.length} chars · {sourceSid ? "→ linked session" : "→ new session"}
        </span>
        <Button size="xs" disabled={busy || !prompt.trim()} onClick={() => void submit()}>
          {busy ? <Spinner className="size-3" /> : <Sparkles className="size-3" />}
          {sourceSid ? "Chat" : "Run"}
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
export const WikiDetail = ({
  path,
  line,
  sourceSid = null,
}: {
  path: string;
  line: number | null;
  sourceSid?: string | null;
}) => {
  const [result, setResult] = useState<FilePreviewContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [editing, setEditing] = useState(false);
  // Edit a markdown file as WYSIWYG (default) or raw markdown source. Non-md
  // text files always edit as raw source.
  const [editRaw, setEditRaw] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  // The path actually on disk, once resolved. A clicked path can be relative to
  // a base the terminal can't know (e.g. `../customer-insights/foo.html` printed
  // inside another file), so anchoring it to the session cwd gives a bogus
  // `/vault/../…`. When that happens we locate the file by its tail under the
  // vault and render THAT. `activePath` is what every file op below uses.
  const [resolvedPath, setResolvedPath] = useState<string | null>(null);
  const activePath = resolvedPath ?? path;
  const [ai, setAi] = useState<{ selection: string; anchor: { top: number; left: number } } | null>(
    null,
  );
  const [vaultRoot, setVaultRoot] = useState<string | null>(null);
  const reading = useSyncExternalStore(subscribeReadingMode, readingMode, () => false);
  const infoPanel = useSyncExternalStore(subscribeInfoPanel, infoPanelOpen, () => true);

  // LOCATION needs a known vault root to strip into a leading-slash relative
  // path; fall back to the absolute directory (folderLabel) when unavailable.
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/wiki/root", { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<{ root: string }>) : null))
      .then((body) => {
        if (body?.root) setVaultRoot(body.root);
      })
      .catch(() => {
        /* vaultRoot stays null; folderLabel falls back to the absolute dir */
      });
    return () => controller.abort();
  }, []);

  // Escape exits reading mode, guarded so it doesn't fight the AI popover or
  // the in-place editor's own Escape handling.
  useEffect(() => {
    if (!reading || ai || editing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReadingMode(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [reading, ai, editing]);

  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError(null);
    setShowSource(line !== null); // a search hit lands on the source at its line
    setEditing(false);
    setAi(null);
    setResolvedPath(null);

    const fetchText = async (target: string): Promise<FileTextResponse | null> => {
      const url = new URL("/api/file/text", window.location.href);
      url.searchParams.set("cwd", dirOf(target));
      url.searchParams.set("path", target);
      const response = await fetch(url, { signal: controller.signal });
      return (await response.json()) as FileTextResponse;
    };

    const load = async () => {
      // A GitHub issue/PR URL isn't a file — the real page can't be iframed, so
      // fetch it through the daemon's `gh`-backed endpoint and render the
      // returned markdown as a virtual .md file (markdown pipeline + select-to-
      // chat work unchanged; edit/save is disabled for it below).
      if (isGithubArtifactPath(path)) {
        try {
          const res = await fetch(`/api/github?url=${encodeURIComponent(path)}`, {
            signal: controller.signal,
          });
          const body = (await res.json()) as { ok?: boolean; markdown?: string; error?: string };
          if (controller.signal.aborted) return;
          if (!res.ok || !body.ok || typeof body.markdown !== "string") {
            setError(body.error ?? "Couldn't load the GitHub issue.");
            return;
          }
          setResult({
            kind: "text",
            path: githubVirtualName(path),
            size: body.markdown.length,
            truncated: false,
            content: body.markdown,
          });
        } catch {
          if (!controller.signal.aborted) {
            setError("Couldn't reach the daemon to load the GitHub issue.");
          }
        }
        return;
      }
      // Fast path: fetch the path exactly as given. The daemon resolves `~` and
      // cwd-relative paths itself (statting a single file), so absolute vault
      // paths AND the `~/vault/…` paths that terminal clicks produce both render
      // in a couple of ms. Only when this genuinely fails do we fall back to the
      // vault-wide `locate` below — which shells out to `find` over the whole
      // (iCloud-backed) tree and can take ~20s, so it must never be the default.
      try {
        const direct = await fetchText(path);
        if (controller.signal.aborted) return;
        if (direct && !("error" in direct)) {
          // The response carries the resolved absolute path; adopt it so the
          // breadcrumb, tree highlight, and file ops work off a real path.
          if (direct.path && direct.path !== path) setResolvedPath(direct.path);
          setResult(direct);
          return;
        }
      } catch {
        if (controller.signal.aborted) return;
        /* transient failure — fall through to locate as a last resort */
      }
      // Fallback: a `..`/`...`-truncated or otherwise unanchored path. Locate the
      // real file by its tail across the vault, then render whatever that finds.
      const relMatch = path.match(/.*\/(?:\.\.|\.\.\.)\/(.+)$/);
      const rel = relMatch ? relMatch[1] : path;
      let target = path;
      try {
        const res = await fetch(`/api/wiki/locate?rel=${encodeURIComponent(rel)}`, {
          signal: controller.signal,
        });
        const body = (await res.json()) as { path: string | null };
        if (body.path) {
          target = body.path;
          if (!controller.signal.aborted) setResolvedPath(body.path);
        }
      } catch {
        if (controller.signal.aborted) return;
        /* locate failed; fall through and try the raw path */
      }
      try {
        const body = await fetchText(target);
        if (!body || controller.signal.aborted) return;
        if ("error" in body) setError(ERROR_MESSAGES[body.error] ?? "Preview failed.");
        else setResult(body);
      } catch {
        if (!controller.signal.aborted) setError("Preview failed: the daemon didn't respond.");
      }
    };
    void load();
    return () => controller.abort();
  }, [path, line, reloadTick]);

  // A GitHub issue/PR rendered in the drawer is read-only (a virtual markdown
  // doc, not a file on disk), so edit/save is suppressed for it.
  const isGithub = isGithubArtifactPath(path);
  const basename = activePath.slice(activePath.lastIndexOf("/") + 1);

  // Breadcrumb: the trail from the vault root down to this file, so you can see
  // where the file lives and click a folder to jump there. Each crumb carries
  // the absolute path it opens; the last (the file) is the current location and
  // isn't a link. Only meaningful for real on-disk files under the vault.
  const crumbs = useMemo(() => {
    if (isGithub || !activePath.startsWith("/")) return [];
    const underVault = vaultRoot && activePath.startsWith(`${vaultRoot}/`);
    const base = underVault ? vaultRoot : "";
    const rootLabel = underVault
      ? vaultRoot.split("/").filter(Boolean).slice(-1)[0] ?? "/"
      : "";
    const rel = activePath.slice(base.length).replace(/^\/+/, "");
    const segments = rel.split("/").filter(Boolean);
    const trail: { label: string; path: string; isDir: boolean }[] = [];
    if (rootLabel) trail.push({ label: rootLabel, path: base, isDir: true });
    let cursor = base;
    segments.forEach((seg, i) => {
      cursor = `${cursor}/${seg}`;
      trail.push({ label: seg, path: cursor, isDir: i < segments.length - 1 });
    });
    return trail;
  }, [activePath, vaultRoot, isGithub]);
  const isText = result?.kind === "text";
  const markdown = isText && isMarkdownPath(result.path);
  const html = isText && isHtmlPath(result.path);
  const csv = isText && isCsvPath(result.path);
  // Markdown/HTML/CSV render by default; other text files are source-only.
  const renderable = markdown || html || csv;

  const startEdit = () => {
    if (!isText || isGithub) return;
    setDraft(result.content);
    setEditRaw(false);
    setEditing(true);
    setAi(null);
  };

  const save = async () => {
    if (!isText || saving) return;
    setSaving(true);
    setSaveError(null);
    const url = new URL("/api/file/text", window.location.href);
    url.searchParams.set("cwd", dirOf(activePath));
    url.searchParams.set("path", activePath);
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
    void createSession(dirOf(activePath)).then(openSession);
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
        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={activePath}>
          {basename}
        </span>
        {sourceSid && (
          <span
            className="flex shrink-0 items-center gap-1 rounded bg-accent/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-accent-foreground"
            title={`Linked to session ${sourceSid}`}
          >
            <Link2 className="size-3" />
            session
          </span>
        )}
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
            {markdown && (
              <div className="flex h-7 shrink-0 items-center rounded-full border border-border p-0.5 font-sans text-[11px]">
                <button
                  type="button"
                  className={cn(
                    "rounded-full px-2.5 py-1 transition-colors",
                    !editRaw ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setEditRaw(false)}
                >
                  Editor
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-full px-2.5 py-1 transition-colors",
                    editRaw ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setEditRaw(true)}
                >
                  Markdown
                </button>
              </div>
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
            {!isGithub && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="reveal in file manager"
                title="Reveal the real file in Finder"
                onClick={() => void revealFileLocation(dirOf(activePath), activePath)}
              >
                <FolderOpen className="size-3.5" />
              </Button>
            )}
            {!isGithub && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="open terminal here"
                title="Open a terminal in this file's folder"
                onClick={openTerminalHere}
              >
                <SquareTerminal className="size-3.5" />
              </Button>
            )}
            {isText && !isGithub && (
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
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Toggle reading mode"
                  title="Toggle reading mode"
                  onClick={toggleReadingMode}
                  className={cn("text-muted-foreground hover:text-foreground", reading && "text-primary")}
                >
                  <BookOpen className="size-3.5" />
                </Button>
                {markdown && !reading && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Toggle info panel"
                    title="Toggle info panel"
                    onClick={() => setInfoPanelOpen(!infoPanel)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {infoPanel ? <PanelRightClose className="size-3.5" /> : <PanelRight className="size-3.5" />}
                  </Button>
                )}
                <div className="flex h-7 shrink-0 items-center rounded-full border border-border p-0.5 font-sans text-[11px]">
                  <button
                    type="button"
                    className={cn(
                      "rounded-full px-2.5 py-1 transition-colors",
                      !showSource ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setShowSource(false)}
                  >
                    Rendered
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "rounded-full px-2.5 py-1 transition-colors",
                      showSource ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setShowSource(true)}
                  >
                    Source
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {!reading && crumbs.length > 0 && (
        <nav
          aria-label="Breadcrumb"
          className="flex h-7 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border/60 px-4 font-mono text-[11px] text-muted-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {crumbs.map((crumb, i) => (
            <span key={crumb.path} className="flex shrink-0 items-center gap-0.5">
              {i > 0 && <ChevronRight className="size-3 shrink-0 text-muted-foreground/40" />}
              {crumb.isDir ? (
                <button
                  type="button"
                  title={crumb.path}
                  onClick={() => openWikiFile(crumb.path)}
                  className="rounded px-1 py-0.5 transition-colors hover:bg-accent/60 hover:text-foreground"
                >
                  {crumb.label}
                </button>
              ) : (
                <span className="px-1 py-0.5 text-foreground">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

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
        ) : editing && markdown && !editRaw ? (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center p-8">
                <Spinner className="size-4" aria-label="loading editor" />
              </div>
            }
          >
            <WysiwygEditor value={draft} onChange={setDraft} />
          </Suspense>
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
              // The frontmatter title used to duplicate the body's H1 in a card
              // stacked above it (B2). Now the H1 is the single title: if the
              // body has none, promote the frontmatter title into one instead
              // of dropping it. STATS still compute off the raw `body` below.
              const hasH1 = /^#[^#]/.test(body.trimStart());
              const titleField = fields.find((f) => f.key.toLowerCase() === "title")?.value;
              const displayBody = !hasH1 && titleField ? `# ${titleField}\n\n${body}` : body;
              // mx-auto (not justify-center) centers the article+panel group when
              // there's room but collapses margins to 0 on overflow, so the group
              // pins to the left edge and stays fully scrollable — justify-center
              // split the overflow to both sides and clipped the start of the text
              // unreachably in the narrower drawer. The article shrinks (min-w-0)
              // instead of forcing overflow, so the metadata panel can't clip it.
              return (
                <div className="mx-auto flex w-fit max-w-full gap-12 px-6 py-10">
                  <article className="wiki-prose w-[710px] min-w-0 max-w-full">
                    <Markdown sourcePath={activePath}>{displayBody}</Markdown>
                  </article>
                  {!reading && infoPanel && (
                    <aside className="sticky top-10 hidden w-60 shrink-0 self-start border-l border-border pl-6 xl:block">
                      <InfoPanel fields={fields} path={activePath} body={body} vaultRoot={vaultRoot} />
                    </aside>
                  )}
                </div>
              );
            })()
          ) : csv && !showSource ? (
            <CsvView path={result.path} content={result.content} />
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
        ) : result.kind === "video" ? (
          <div className="flex h-full items-center justify-center p-6">
            <video
              src={buildMediaUrl(dirOf(activePath), result.path)}
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
            {result.entries.map((entry) => (
              <button
                key={entry.name}
                type="button"
                className="flex w-full items-center gap-2 border-l-2 border-transparent py-1 pl-[calc(1rem-2px)] pr-4 text-left font-mono text-xs hover:border-[var(--primary)] hover:bg-muted/40"
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
          path={activePath}
          selection={ai.selection}
          line={line}
          sourceSid={sourceSid}
          anchor={ai.anchor}
          onClose={() => setAi(null)}
        />
      ) : null}
    </div>
  );
};
