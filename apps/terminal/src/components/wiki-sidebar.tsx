import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, File, Folder, FolderOpen, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { openWikiFile } from "@/hooks/use-shell";
import { fetchSessions } from "@/lib/deck-session";

interface Entry {
  name: string;
  isDirectory: boolean;
}

interface SearchHit {
  path: string;
  line: number;
  snippet: string;
}

// Debounced full-text search over the vault via GET /api/wiki/search (ripgrep).
const useWikiSearch = (query: string) => {
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setHits(null);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(() => {
      const url = new URL("/api/wiki/search", window.location.href);
      url.searchParams.set("q", trimmed);
      void fetch(url, { signal: controller.signal })
        .then(async (response) => {
          const body = (await response.json()) as { results: SearchHit[] };
          if (controller.signal.aborted) return;
          setHits(body.results ?? []);
          setSearching(false);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setHits([]);
            setSearching(false);
          }
        });
    }, 200);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  return { hits, searching };
};

// Fetch a directory's immediate children via /api/file/text (kind: directory).
const fetchDir = async (root: string, dirPath: string, signal?: AbortSignal): Promise<Entry[]> => {
  const url = new URL("/api/file/text", window.location.href);
  url.searchParams.set("cwd", root);
  url.searchParams.set("path", dirPath);
  const response = await fetch(url, { signal });
  const body = (await response.json()) as
    | { kind: "directory"; entries: Entry[] }
    | { kind: string }
    | { error: string };
  if ("kind" in body && body.kind === "directory") return (body as { entries: Entry[] }).entries;
  return [];
};

// A single tree row; directories lazily load their children on first expand.
const TreeNode = ({
  root,
  path,
  name,
  isDirectory,
  depth,
  activePath,
}: {
  root: string;
  path: string;
  name: string;
  isDirectory: boolean;
  depth: number;
  activePath: string | null;
}) => {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<Entry[] | null>(null);

  useEffect(() => {
    if (!open || children !== null) return;
    const controller = new AbortController();
    void fetchDir(root, path, controller.signal).then(setChildren).catch(() => setChildren([]));
    return () => controller.abort();
  }, [open, children, root, path]);

  const isActive = !isDirectory && path === activePath;

  return (
    <div>
      <button
        type="button"
        onClick={() => (isDirectory ? setOpen((v) => !v) : openWikiFile(path))}
        title={name}
        className={cn(
          "flex w-full items-center gap-1 py-1 pr-2 text-left font-mono text-xs transition-colors",
          isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/40",
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isDirectory ? (
          open ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground/70" />
               : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/70" />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {isDirectory ? (
          open ? <FolderOpen className="size-3.5 shrink-0 text-muted-foreground/70" />
               : <Folder className="size-3.5 shrink-0 text-muted-foreground/70" />
        ) : (
          <File className="size-3.5 shrink-0 text-muted-foreground/50" />
        )}
        <span className="truncate">{name}</span>
      </button>
      {isDirectory && open && children?.map((child) => (
        <TreeNode
          key={child.name}
          root={root}
          path={`${path}/${child.name}`}
          name={child.name}
          isDirectory={child.isDirectory}
          depth={depth + 1}
          activePath={activePath}
        />
      ))}
    </div>
  );
};

// Wiki-mode subnav: a native file tree rooted at the vault (the daemon's
// configured default cwd), served by the same /api/file/text endpoint the
// file preview uses. No second app.
export const WikiSidebar = ({ activePath }: { activePath: string | null }) => {
  const [root, setRoot] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [query, setQuery] = useState("");
  const { hits, searching } = useWikiSearch(query);
  const searchActive = query.trim().length >= 2;

  useEffect(() => {
    const controller = new AbortController();
    const resolveRoot = async () => {
      try {
        const response = await fetch("/api/wiki/root", { signal: controller.signal });
        if (response.ok) {
          const body = (await response.json()) as { root: string };
          if (body.root) {
            setRoot(body.root);
            return;
          }
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      // Fallback for a daemon without /api/wiki/root (e.g. pre-restart): derive
      // the vault root from a live session's working directory.
      try {
        const sessions = await fetchSessions(controller.signal);
        const cwd = sessions.find((s) => s.cwd)?.cwd;
        setRoot(cwd ?? null);
      } catch {
        if (!controller.signal.aborted) setRoot(null);
      }
    };
    void resolveRoot();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!root) return;
    const controller = new AbortController();
    void fetchDir(root, root, controller.signal).then(setEntries).catch(() => setEntries([]));
    return () => controller.abort();
  }, [root]);

  const rootName = root ? root.split("/").filter(Boolean).slice(-1)[0] ?? "/" : "";

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center px-3">
        <span className="truncate font-mono text-[11px] font-semibold tracking-wide text-muted-foreground" title={root ?? ""}>
          {rootName ? `EXPLORER · ${rootName}` : "EXPLORER"}
        </span>
      </div>
      <div className="shrink-0 px-2 pb-2">
        <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2">
          <Search className="size-3.5 shrink-0 text-muted-foreground/60" />
          <input
            value={query}
            placeholder="Search vault…"
            aria-label="search vault"
            className="h-7 w-full bg-transparent font-mono text-xs outline-none placeholder:text-muted-foreground/50"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
            }}
          />
          {query && (
            <button
              type="button"
              aria-label="clear search"
              className="shrink-0 text-muted-foreground/60 hover:text-foreground"
              onClick={() => setQuery("")}
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {searchActive ? (
          searching && hits === null ? (
            <div className="px-3 py-4 text-center font-mono text-[11px] text-muted-foreground/60">
              searching…
            </div>
          ) : hits && hits.length > 0 ? (
            hits.map((hit, i) => {
              const name = hit.path.slice(hit.path.lastIndexOf("/") + 1);
              return (
                <button
                  key={`${hit.path}:${hit.line}:${i}`}
                  type="button"
                  title={`${hit.path}:${hit.line}`}
                  className="flex w-full flex-col gap-0.5 border-b border-border/30 px-3 py-1.5 text-left hover:bg-accent/40"
                  onClick={() => openWikiFile(hit.path, hit.line)}
                >
                  <span className="flex items-center gap-1.5 truncate font-mono text-[11px] text-foreground">
                    <File className="size-3 shrink-0 text-muted-foreground/50" />
                    {name}
                    <span className="text-muted-foreground/50">:{hit.line}</span>
                  </span>
                  <span className="truncate pl-4 font-mono text-[10px] text-muted-foreground/70">
                    {hit.snippet}
                  </span>
                </button>
              );
            })
          ) : (
            <div className="px-3 py-4 text-center font-mono text-[11px] text-muted-foreground/60">
              no matches
            </div>
          )
        ) : (
          <>
            {root && entries?.map((entry) => (
              <TreeNode
                key={entry.name}
                root={root}
                path={`${root}/${entry.name}`}
                name={entry.name}
                isDirectory={entry.isDirectory}
                depth={0}
                activePath={activePath}
              />
            ))}
            {entries?.length === 0 && (
              <div className="px-3 py-6 text-center font-mono text-xs text-muted-foreground/60">empty</div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
