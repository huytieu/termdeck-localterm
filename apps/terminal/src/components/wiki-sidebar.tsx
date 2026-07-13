import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, File, Folder, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { openWikiFile } from "@/hooks/use-shell";
import { fetchSessions } from "@/lib/deck-session";

interface Entry {
  name: string;
  isDirectory: boolean;
}

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
      <div className="min-h-0 flex-1 overflow-auto py-1">
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
      </div>
    </div>
  );
};
