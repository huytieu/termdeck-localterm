import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronRight,
  File,
  FilePlus,
  Folder,
  FolderOpen,
  FolderPlus,
  ListFilter,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { openWikiFile } from "@/hooks/use-shell";
import { fetchSessions } from "@/lib/deck-session";
import { wikiTreeState } from "@/lib/wiki-tree-state";
import {
  createFile,
  createFolder,
  deletePath,
  movePath,
  renamePath,
} from "@/lib/wiki-file-ops";
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

interface NodeRef {
  path: string;
  name: string;
  isDirectory: boolean;
}

interface SearchHit {
  path: string;
  line: number;
  snippet: string;
}

const dirOf = (p: string): string => p.slice(0, p.lastIndexOf("/")) || "/";

// Shared interaction layer for the tree: the context menu, inline rename/create,
// drag-to-move, and which folder new entries land in. Passed via context so the
// recursive TreeNode doesn't have to thread a dozen props through every level.
interface TreeContextValue {
  root: string;
  activePath: string | null;
  filter: WikiFilter;
  busy: boolean;
  renaming: string | null;
  creatingIn: string | null;
  creatingKind: "file" | "folder";
  openMenu: (event: ReactMouseEvent, node: NodeRef) => void;
  submitRename: (node: NodeRef, name: string) => void;
  submitCreate: (name: string) => void;
  cancelEdit: () => void;
  selectFolder: (path: string) => void;
  dragPath: string | null;
  setDragPath: (path: string | null) => void;
  dragOverDir: string | null;
  setDragOverDir: (path: string | null) => void;
  dropInto: (destDir: string) => void;
}

const TreeContext = createContext<TreeContextValue | null>(null);
const useTree = (): TreeContextValue => {
  const ctx = useContext(TreeContext);
  if (!ctx) throw new Error("TreeContext missing");
  return ctx;
};

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

// Inline text field used for both rename and new-entry creation: Enter commits,
// Escape / blur cancels. Prefilled + text pre-selected for rename.
const InlineInput = ({
  initial,
  placeholder,
  icon,
  onSubmit,
  onCancel,
}: {
  initial: string;
  placeholder: string;
  icon: ReactNode;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) => {
  const [value, setValue] = useState(initial);
  // A commit unmounts this input; guard so the resulting blur doesn't fire a
  // second (cancel) action after Enter/submit.
  const committed = useRef(false);
  return (
    <div className="flex items-center gap-1">
      {icon}
      <input
        autoFocus
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-6 w-full rounded border border-primary bg-background px-1 font-mono text-xs outline-none placeholder:text-muted-foreground/50"
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => {
          if (!committed.current) onCancel();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            committed.current = true;
            onSubmit(value);
          }
          if (e.key === "Escape") {
            committed.current = true;
            onCancel();
          }
        }}
      />
    </div>
  );
};

// A single tree row; directories lazily load their children on first expand and
// re-fetch when their dir version bumps (after a file op).
const TreeNode = ({
  path,
  name,
  isDirectory,
  depth,
}: {
  path: string;
  name: string;
  isDirectory: boolean;
  depth: number;
}) => {
  const tree = useTree();
  const { root, activePath, filter } = tree;
  const open = useSyncExternalStore(
    wikiTreeState.subscribe,
    () => wikiTreeState.isOpen(path),
    () => false,
  );
  const version = useSyncExternalStore(
    wikiTreeState.subscribeDir,
    () => wikiTreeState.dirVersion(path),
    () => 0,
  );
  const [children, setChildren] = useState<Entry[] | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  // Load children when open, and re-load when this dir's version bumps.
  useEffect(() => {
    if (!isDirectory || !open) return;
    const controller = new AbortController();
    void fetchDir(root, path, controller.signal).then(setChildren).catch(() => setChildren([]));
    return () => controller.abort();
  }, [isDirectory, open, root, path, version]);

  const isActive = path === activePath;
  useEffect(() => {
    if (isActive) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [isActive]);

  if (filter.hideDotfiles && name.startsWith(".")) return null;
  if (!isDirectory && !fileMatches(name, filter)) return null;
  const hideRow = isDirectory && filter.filesOnly;

  const isRenaming = tree.renaming === path;
  const isDropTarget = isDirectory && tree.dragOverDir === path;
  const childDepth = hideRow ? depth : depth + 1;

  return (
    <div>
      {!hideRow && (
        <div
          ref={rowRef}
          draggable={!isRenaming}
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.effectAllowed = "move";
            tree.setDragPath(path);
          }}
          onDragEnd={() => {
            tree.setDragPath(null);
            tree.setDragOverDir(null);
          }}
          onDragOver={
            isDirectory
              ? (e) => {
                  if (!tree.dragPath || tree.dragPath === path) return;
                  // Claim the drag for THIS folder so the container's
                  // drop-on-empty-space (→ root) handler doesn't also see it.
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = "move";
                  if (tree.dragOverDir !== path) tree.setDragOverDir(path);
                }
              : undefined
          }
          onDragLeave={
            isDirectory
              ? (e) => {
                  // Only clear when leaving the row entirely, not when moving
                  // between its children.
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    if (tree.dragOverDir === path) tree.setDragOverDir(null);
                  }
                }
              : undefined
          }
          onDrop={
            isDirectory
              ? (e) => {
                  e.preventDefault();
                  // Stop the bubble so the container's root-drop handler doesn't
                  // fire a SECOND move for the same drag to a different folder.
                  e.stopPropagation();
                  tree.dropInto(path);
                }
              : undefined
          }
          onContextMenu={(e) => tree.openMenu(e, { path, name, isDirectory })}
          className={cn(
            "flex w-full items-center gap-1 py-1 pr-2 font-mono text-xs transition-colors",
            isActive
              ? "bg-accent text-accent-foreground"
              : isDropTarget
                ? "bg-primary/20 ring-1 ring-inset ring-primary/60"
                : "hover:bg-accent/40",
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {isDirectory ? (
            <button
              type="button"
              aria-label={open ? "Collapse folder" : "Expand folder"}
              className="shrink-0 rounded text-muted-foreground/70 hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                wikiTreeState.setOpen(path, !open);
              }}
            >
              {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            </button>
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          {isRenaming ? (
            <InlineInput
              initial={name}
              placeholder="rename"
              icon={
                isDirectory ? (
                  <Folder className="size-3.5 shrink-0 text-muted-foreground/70" />
                ) : (
                  <File className="size-3.5 shrink-0 text-muted-foreground/50" />
                )
              }
              onSubmit={(value) => tree.submitRename({ path, name, isDirectory }, value)}
              onCancel={tree.cancelEdit}
            />
          ) : (
            <button
              type="button"
              title={name}
              onClick={() => {
                if (isDirectory) {
                  wikiTreeState.setOpen(path, true);
                  tree.selectFolder(path);
                } else {
                  // Selecting a file makes its folder the target for new entries.
                  tree.selectFolder(dirOf(path));
                }
                openWikiFile(path);
              }}
              className="flex min-w-0 flex-1 items-center gap-1 text-left"
            >
              {isDirectory ? (
                open ? <FolderOpen className="size-3.5 shrink-0 text-muted-foreground/70" />
                     : <Folder className="size-3.5 shrink-0 text-muted-foreground/70" />
              ) : (
                <File className="size-3.5 shrink-0 text-muted-foreground/50" />
              )}
              <span className="truncate">{name}</span>
            </button>
          )}
        </div>
      )}
      {isDirectory && open && (
        <>
          {tree.creatingIn === path && (
            <div style={{ paddingLeft: `${childDepth * 12 + 8}px` }} className="py-1 pr-2">
              <InlineInput
                initial=""
                placeholder={tree.creatingKind === "folder" ? "new-folder" : "new-note (.md)"}
                icon={
                  tree.creatingKind === "folder" ? (
                    <Folder className="size-3.5 shrink-0 text-muted-foreground/70" />
                  ) : (
                    <File className="size-3.5 shrink-0 text-muted-foreground/50" />
                  )
                }
                onSubmit={tree.submitCreate}
                onCancel={tree.cancelEdit}
              />
            </div>
          )}
          {children?.map((child) => (
            <TreeNode
              key={child.name}
              path={`${path}/${child.name}`}
              name={child.name}
              isDirectory={child.isDirectory}
              depth={childDepth}
            />
          ))}
        </>
      )}
    </div>
  );
};

// The right-click menu, portaled to <body> so the sidebar's overflow never
// clips it. Closes on any outside interaction, scroll, or Escape.
const ContextMenu = ({
  x,
  y,
  node,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onClose,
}: {
  x: number;
  y: number;
  node: NodeRef;
  onNewFile: () => void;
  onNewFolder: () => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}) => {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    document.addEventListener("scroll", close, true);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
      document.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const item = "flex w-full items-center gap-2 px-2.5 py-1.5 text-left font-mono text-xs hover:bg-accent";
  // Keep the menu on-screen: clamp near the right/bottom edges.
  const left = Math.min(x, window.innerWidth - 180);
  const top = Math.min(y, window.innerHeight - 160);

  return createPortal(
    <div
      role="menu"
      className="fixed z-50 min-w-[160px] overflow-hidden rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-lg"
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {node.isDirectory && (
        <>
          <button type="button" className={item} onClick={onNewFile}>
            <FilePlus className="size-3.5 text-muted-foreground/70" /> New file
          </button>
          <button type="button" className={item} onClick={onNewFolder}>
            <FolderPlus className="size-3.5 text-muted-foreground/70" /> New folder
          </button>
          <div className="my-1 h-px bg-border" />
        </>
      )}
      <button type="button" className={item} onClick={onRename}>
        <Pencil className="size-3.5 text-muted-foreground/70" /> Rename
      </button>
      <button
        type="button"
        className={cn(item, "text-red-500 hover:bg-red-500/10")}
        onClick={onDelete}
      >
        <Trash2 className="size-3.5" /> Delete
      </button>
    </div>,
    document.body,
  );
};

// Delete confirmation, file-manager style: modal overlay, explicit consequence,
// destructive action on the right.
const DeleteDialog = ({
  node,
  busy,
  onConfirm,
  onCancel,
}: {
  node: NodeRef;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onConfirm]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={onCancel}
    >
      <div
        role="alertdialog"
        aria-label="Confirm delete"
        className="w-full max-w-sm rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-red-500/15 text-red-500">
            <Trash2 className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="font-sans text-sm font-semibold">
              Delete {node.isDirectory ? "folder" : "file"}?
            </p>
            <p className="mt-1 break-words font-mono text-xs text-muted-foreground">{node.name}</p>
            <p className="mt-2 font-sans text-xs text-muted-foreground">
              {node.isDirectory
                ? "This folder and everything inside it will be permanently deleted."
                : "This file will be permanently deleted."}
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-3 py-1.5 font-sans text-xs hover:bg-accent"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-md bg-red-600 px-3 py-1.5 font-sans text-xs font-medium text-white hover:bg-red-500 disabled:opacity-60"
            onClick={onConfirm}
            disabled={busy}
            autoFocus
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// Wiki-mode subnav: a native file tree rooted at the vault (the daemon's
// configured default cwd), served by the same /api/file/text endpoint the
// file preview uses. Doubles as a lightweight file manager.
export const WikiSidebar = ({ activePath }: { activePath: string | null }) => {
  const [root, setRoot] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<WikiFilter>(loadFilter);
  const [filterOpen, setFilterOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // In-flight guard for moves; see dropInto for why a ref (not `busy`) is needed.
  const movingRef = useRef(false);
  // The folder new entries land in (last folder clicked / right-clicked). The
  // header buttons create here; null means the vault root.
  const [selectedDir, setSelectedDir] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const [creatingKind, setCreatingKind] = useState<"file" | "folder">("file");
  const [menu, setMenu] = useState<{ x: number; y: number; node: NodeRef } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<NodeRef | null>(null);
  const [dragPath, setDragPath] = useState<string | null>(null);
  const [dragOverDir, setDragOverDir] = useState<string | null>(null);
  const { hits, searching } = useWikiSearch(query);
  const searchActive = query.trim().length >= 2;

  // Root entries re-fetch when the root's dir version bumps (a file op at root).
  const rootVersion = useSyncExternalStore(
    wikiTreeState.subscribeDir,
    () => (root ? wikiTreeState.dirVersion(root) : 0),
    () => 0,
  );

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

  const cancelEdit = useCallback(() => {
    setRenaming(null);
    setCreatingIn(null);
    setError(null);
  }, []);

  // Begin creating an entry inside `dir` (defaults to root). Expands the folder
  // so the inline input is visible.
  const beginCreate = useCallback(
    (dir: string, kind: "file" | "folder") => {
      setMenu(null);
      setRenaming(null);
      setError(null);
      setCreatingKind(kind);
      setCreatingIn(dir);
      if (root && dir !== root) wikiTreeState.setOpen(dir, true);
    },
    [root],
  );

  const submitCreate = useCallback(
    (rawName: string) => {
      if (!root || creatingIn === null || busy) return;
      let name = rawName.trim().replace(/^\/+|\/+$/g, "");
      if (!name) {
        cancelEdit();
        return;
      }
      const kind = creatingKind;
      if (kind === "file" && !/\.[a-z0-9]+$/i.test(name)) name += ".md";
      const dir = creatingIn;
      const abs = `${dir}/${name}`;
      setBusy(true);
      setError(null);
      void (kind === "folder" ? createFolder(root, abs) : createFile(root, abs)).then((res) => {
        setBusy(false);
        if (!res.ok) {
          setError(res.error ?? "Couldn't create it.");
          return;
        }
        wikiTreeState.bumpDirs([dir]);
        setCreatingIn(null);
        if (kind === "folder") wikiTreeState.setOpen(abs, true);
        else openWikiFile(abs);
      });
    },
    [root, creatingIn, creatingKind, busy, cancelEdit],
  );

  const submitRename = useCallback(
    (node: NodeRef, rawName: string) => {
      if (!root || busy) return;
      const name = rawName.trim().replace(/^\/+|\/+$/g, "");
      if (!name || name === node.name) {
        cancelEdit();
        return;
      }
      setBusy(true);
      setError(null);
      void renamePath(root, node.path, name).then((res) => {
        setBusy(false);
        if (!res.ok) {
          setError(res.error ?? "Couldn't rename it.");
          return;
        }
        const parent = dirOf(node.path);
        const next = `${parent}/${name}`;
        wikiTreeState.bumpDirs([parent]);
        setRenaming(null);
        // Keep the viewer pointed at the renamed thing if it was open.
        if (activePath === node.path) openWikiFile(next);
      });
    },
    [root, busy, activePath, cancelEdit],
  );

  const dropInto = useCallback(
    (destDir: string) => {
      const src = dragPath;
      setDragPath(null);
      setDragOverDir(null);
      // Synchronous guard: two handlers firing in one event tick both read the
      // pre-render `busy` (still false), so the state check alone can't stop a
      // second move. A ref flips immediately, so a single drag can only ever
      // trigger one `mv` — a move must never race with itself and lose a file.
      if (!root || !src || busy || movingRef.current) return;
      if (dirOf(src) === destDir) return;
      movingRef.current = true;
      setBusy(true);
      setError(null);
      void movePath(root, src, destDir).then((res) => {
        movingRef.current = false;
        setBusy(false);
        if (!res.ok) {
          setError(res.error ?? "Couldn't move it.");
          return;
        }
        const name = src.slice(src.lastIndexOf("/") + 1);
        wikiTreeState.bumpDirs([dirOf(src), destDir]);
        wikiTreeState.setOpen(destDir, true);
        if (activePath === src) openWikiFile(`${destDir}/${name}`);
      });
    },
    [root, dragPath, busy, activePath],
  );

  const runDelete = useCallback(
    (node: NodeRef) => {
      if (!root || busy) return;
      setBusy(true);
      setError(null);
      void deletePath(root, node.path, node.isDirectory).then((res) => {
        setBusy(false);
        if (!res.ok) {
          setError(res.error ?? "Couldn't delete it.");
          return;
        }
        wikiTreeState.bumpDirs([dirOf(node.path)]);
        setConfirmDelete(null);
        // If the open file lived here, drop the viewer back to the parent folder.
        if (activePath === node.path || activePath?.startsWith(`${node.path}/`)) {
          openWikiFile(dirOf(node.path));
        }
      });
    },
    [root, busy, activePath],
  );

  const openMenu = useCallback((event: ReactMouseEvent, node: NodeRef) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, node });
  }, []);

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
  }, [root, rootVersion]);

  // Reveal the active file: expand every ancestor folder between the vault root
  // and the file so the highlighted row renders (and scrolls into view). Also
  // remember the file's folder as the create target.
  useEffect(() => {
    if (!root || !activePath || !activePath.startsWith(`${root}/`)) return;
    const segments = activePath.slice(root.length + 1).split("/");
    const ancestors: string[] = [];
    let cursor = root;
    for (let i = 0; i < segments.length - 1; i++) {
      cursor = `${cursor}/${segments[i]}`;
      ancestors.push(cursor);
    }
    if (ancestors.length > 0) wikiTreeState.openPaths(ancestors);
  }, [root, activePath]);

  const rootName = root ? root.split("/").filter(Boolean).slice(-1)[0] ?? "/" : "";
  // Where the header buttons create: the selected folder, else the vault root.
  const createTarget = selectedDir ?? root;
  const createTargetName =
    createTarget && root && createTarget !== root
      ? createTarget.slice(createTarget.lastIndexOf("/") + 1)
      : rootName;

  const ctx: TreeContextValue | null = root
    ? {
        root,
        activePath,
        filter,
        busy,
        renaming,
        creatingIn,
        creatingKind,
        openMenu,
        submitRename,
        submitCreate,
        cancelEdit,
        selectFolder: setSelectedDir,
        dragPath,
        setDragPath,
        dragOverDir,
        setDragOverDir,
        dropInto,
      }
    : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 px-3">
        <span
          className="flex-1 truncate font-mono text-[11px] font-semibold tracking-wide text-muted-foreground"
          title={root ?? ""}
        >
          {rootName ? `EXPLORER · ${rootName}` : "EXPLORER"}
        </span>
        <button
          type="button"
          aria-label="New file"
          title={createTarget ? `New file in ${createTargetName}` : "New file"}
          className="shrink-0 rounded p-0.5 text-muted-foreground/70 hover:bg-accent hover:text-foreground"
          disabled={!root}
          onClick={() => root && beginCreate(createTarget ?? root, "file")}
        >
          <FilePlus className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="New folder"
          title={createTarget ? `New folder in ${createTargetName}` : "New folder"}
          className="shrink-0 rounded p-0.5 text-muted-foreground/70 hover:bg-accent hover:text-foreground"
          disabled={!root}
          onClick={() => root && beginCreate(createTarget ?? root, "folder")}
        >
          <FolderPlus className="size-3.5" />
        </button>
      </div>

      {error && (
        <div className="mx-2 mb-1.5 flex items-start gap-1.5 rounded border border-red-500/40 bg-red-500/10 px-2 py-1 font-mono text-[10px] text-red-400">
          <span className="min-w-0 flex-1 break-words">{error}</span>
          <button
            type="button"
            aria-label="dismiss error"
            className="shrink-0 hover:text-red-300"
            onClick={() => setError(null)}
          >
            <X className="size-3" />
          </button>
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

      <div
        className="min-h-0 flex-1 overflow-auto py-1"
        // Drop onto empty space (or right-click it) targets the vault root.
        onDragOver={
          dragPath && root
            ? (e) => {
                e.preventDefault();
                if (dragOverDir !== root) setDragOverDir(root);
              }
            : undefined
        }
        onDrop={dragPath && root ? () => dropInto(root) : undefined}
      >
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
        ) : ctx ? (
          <TreeContext.Provider value={ctx}>
            {creatingIn === root && (
              <div className="px-2 py-1">
                <InlineInput
                  initial=""
                  placeholder={creatingKind === "folder" ? "new-folder" : "new-note (.md)"}
                  icon={
                    creatingKind === "folder" ? (
                      <Folder className="size-3.5 shrink-0 text-muted-foreground/70" />
                    ) : (
                      <File className="size-3.5 shrink-0 text-muted-foreground/50" />
                    )
                  }
                  onSubmit={submitCreate}
                  onCancel={cancelEdit}
                />
              </div>
            )}
            {entries?.map((entry) => (
              <TreeNode
                key={entry.name}
                path={`${root}/${entry.name}`}
                name={entry.name}
                isDirectory={entry.isDirectory}
                depth={0}
              />
            ))}
            {entries?.length === 0 && creatingIn !== root && (
              <div className="px-3 py-6 text-center font-mono text-xs text-muted-foreground/60">empty</div>
            )}
          </TreeContext.Provider>
        ) : null}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          node={menu.node}
          onNewFile={() => beginCreate(menu.node.path, "file")}
          onNewFolder={() => beginCreate(menu.node.path, "folder")}
          onRename={() => {
            setMenu(null);
            setCreatingIn(null);
            setRenaming(menu.node.path);
          }}
          onDelete={() => {
            setConfirmDelete(menu.node);
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      )}
      {confirmDelete && (
        <DeleteDialog
          node={confirmDelete}
          busy={busy}
          onConfirm={() => runDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
};
