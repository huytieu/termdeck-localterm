import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ChevronDown,
  ChevronRight,
  File,
  FilePlus,
  Folder,
  FolderOpen,
  ListFilter,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { openWikiFile } from "@/hooks/use-shell";
import { fetchSessions } from "@/lib/deck-session";
import { wikiTreeState } from "@/lib/wiki-tree-state";
import {
  extOf,
  fileMatches,
  loadFilter,
  saveFilter,
  type WikiFilter,
} from "@/lib/wiki-filter";

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
  filter,
}: {
  root: string;
  path: string;
  name: string;
  isDirectory: boolean;
  depth: number;
  activePath: string | null;
  filter: WikiFilter;
}) => {
  // Open state is persisted (survives reload) and shared across rows.
  const open = useSyncExternalStore(
    wikiTreeState.subscribe,
    () => wikiTreeState.isOpen(path),
    () => false,
  );
  const [children, setChildren] = useState<Entry[] | null>(null);

  useEffect(() => {
    if (!open || children !== null) return;
    const controller = new AbortController();
    void fetchDir(root, path, controller.signal).then(setChildren).catch(() => setChildren([]));
    return () => controller.abort();
  }, [open, children, root, path]);

  // Filtering. Dotfiles hidden as a unit; files gated by ext/pattern; folders
  // stay visible so you can drill in (unless "files only" hides folder rows).
  if (filter.hideDotfiles && name.startsWith(".")) return null;
  if (!isDirectory && !fileMatches(name, filter)) return null;
  const hideRow = isDirectory && filter.filesOnly;

  const isActive = !isDirectory && path === activePath;

  return (
    <div>
      {!hideRow && (
        <button
          type="button"
          onClick={() => (isDirectory ? wikiTreeState.setOpen(path, !open) : openWikiFile(path))}
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
      )}
      {isDirectory && open && children?.map((child) => (
        <TreeNode
          key={child.name}
          root={root}
          path={`${path}/${child.name}`}
          name={child.name}
          isDirectory={child.isDirectory}
          depth={hideRow ? depth : depth + 1}
          activePath={activePath}
          filter={filter}
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
  const [filter, setFilter] = useState<WikiFilter>(loadFilter);
  const [filterOpen, setFilterOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const { hits, searching } = useWikiSearch(query);
  const searchActive = query.trim().length >= 2;

  const updateFilter = (patch: Partial<WikiFilter>) => {
    setFilter((prev) => {
      const next = { ...prev, ...patch };
      saveFilter(next);
      return next;
    });
  };
  const toggleExt = (e: string) =>
    updateFilter({
      exts: filter.exts.includes(e)
        ? filter.exts.filter((x) => x !== e)
        : [...filter.exts, e],
    });
  const filterActive =
    filter.exts.length > 0 || filter.pattern.trim() !== "" || filter.filesOnly || !filter.hideDotfiles;

  // Extension chips from the files present at the tree root, plus any selected.
  const availableExts = useMemo(() => {
    const s = new Set<string>(filter.exts);
    entries?.forEach((e) => {
      if (!e.isDirectory) {
        const x = extOf(e.name);
        if (x) s.add(x);
      }
    });
    return [...s].sort();
  }, [entries, filter.exts]);

  // New file: default to .md when no extension. The server has no create route
  // (PUT /api/file/text requires an existing file) and rebuilding the daemon
  // would drop live sessions, so create the (empty) file via the one-shot
  // /api/exec command runner, then refresh the tree and open it.
  const shq = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
  const createFile = async () => {
    if (!root || createBusy) return;
    let name = newName.trim().replace(/^\/+/, "");
    if (!name) return;
    if (!/\.[a-z0-9]+$/i.test(name)) name += ".md";
    const abs = `${root}/${name}`;
    const dir = abs.slice(0, abs.lastIndexOf("/")) || root;
    setCreateBusy(true);
    try {
      await fetch("/api/exec", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          command: `mkdir -p ${shq(dir)} && if [ ! -e ${shq(abs)} ]; then : > ${shq(abs)}; fi`,
          cwd: root,
          timeoutMs: 10000,
        }),
      });
      const fresh = await fetchDir(root, root);
      setEntries(fresh);
      setCreating(false);
      setNewName("");
      openWikiFile(abs);
    } catch {
      /* leave the input open so the user can retry */
    } finally {
      setCreateBusy(false);
    }
  };

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
      <div className="flex h-9 shrink-0 items-center gap-1 px-3">
        <span className="flex-1 truncate font-mono text-[11px] font-semibold tracking-wide text-muted-foreground" title={root ?? ""}>
          {rootName ? `EXPLORER · ${rootName}` : "EXPLORER"}
        </span>
        <button
          type="button"
          aria-label="New file"
          title="New file (.md)"
          className="shrink-0 rounded p-0.5 text-muted-foreground/70 hover:bg-accent hover:text-foreground"
          onClick={() => {
            setCreating(true);
            setNewName("");
          }}
        >
          <FilePlus className="size-3.5" />
        </button>
      </div>
      {creating && (
        <div className="shrink-0 px-2 pb-1.5">
          <div className="flex items-center gap-1.5 rounded-md border border-primary bg-background px-2">
            <File className="size-3.5 shrink-0 text-muted-foreground/60" />
            <input
              autoFocus
              value={newName}
              placeholder="new-note (.md added if omitted)"
              aria-label="new file name"
              disabled={createBusy}
              className="h-7 w-full bg-transparent font-mono text-xs outline-none placeholder:text-muted-foreground/50"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void createFile();
                if (e.key === "Escape") {
                  setCreating(false);
                  setNewName("");
                }
              }}
            />
            <button
              type="button"
              aria-label="cancel new file"
              className="shrink-0 text-muted-foreground/60 hover:text-foreground"
              onClick={() => {
                setCreating(false);
                setNewName("");
              }}
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}
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
        {/* File filter: extension chips + pattern + dotfile / files-only toggles */}
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className="flex w-full items-center gap-1.5 px-0.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:text-foreground"
          >
            {filterOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            <ListFilter className="size-3" />
            <span>Filter</span>
            {filterActive && (
              <span className="ml-auto rounded bg-accent px-1 text-[10px] text-accent-foreground">on</span>
            )}
          </button>
          {filterOpen && (
            <div className="mt-1 flex flex-col gap-1.5">
              {availableExts.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {availableExts.map((e) => {
                    const on = filter.exts.includes(e);
                    return (
                      <button
                        key={e}
                        type="button"
                        onClick={() => toggleExt(e)}
                        className={cn(
                          "rounded border px-1 py-0.5 font-mono text-[10px] transition-colors",
                          on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border hover:bg-accent/40",
                        )}
                      >
                        .{e}
                      </button>
                    );
                  })}
                </div>
              )}
              <input
                value={filter.pattern}
                placeholder="pattern… *.md, draft"
                aria-label="filter by name pattern"
                className="h-6 w-full rounded border border-border bg-background px-1.5 font-mono text-[11px] outline-none placeholder:text-muted-foreground/50"
                onChange={(e) => updateFilter({ pattern: e.target.value })}
              />
              <div className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
                <label className="flex cursor-pointer items-center gap-1 select-none">
                  <input
                    type="checkbox"
                    checked={filter.hideDotfiles}
                    onChange={(e) => updateFilter({ hideDotfiles: e.target.checked })}
                  />
                  hide dotfiles
                </label>
                <label className="flex cursor-pointer items-center gap-1 select-none">
                  <input
                    type="checkbox"
                    checked={filter.filesOnly}
                    onChange={(e) => updateFilter({ filesOnly: e.target.checked })}
                  />
                  files only
                </label>
                {filterActive && (
                  <button
                    type="button"
                    className="ml-auto hover:text-foreground"
                    onClick={() =>
                      updateFilter({ exts: [], pattern: "", filesOnly: false, hideDotfiles: true })
                    }
                  >
                    clear
                  </button>
                )}
              </div>
            </div>
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
                filter={filter}
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
