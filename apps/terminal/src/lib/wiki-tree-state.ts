// Persisted open/collapse state for the Wiki (file browser) tree, so the layout
// survives a reload. A tiny external store (no deps) keyed by absolute path;
// TreeNode subscribes via useSyncExternalStore. On reload each open folder
// re-loads its children, which mounts nested rows that restore their own state,
// so the whole expanded tree rebuilds via the render cascade.

const STORAGE_KEY = "lt-wiki-expanded";

function load(): Set<string> {
  try {
    const a = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return new Set(Array.isArray(a) ? (a as string[]) : []);
  } catch {
    return new Set();
  }
}

let expanded = load();
const listeners = new Set<() => void>();

// Refresh counters, one per directory path. A file op (create/rename/move/
// delete) bumps the affected directories; the rows rendering those directories
// subscribe to their own counter and re-fetch children when it changes. This is
// how a mutation shows up in the tree without a full reload.
const dirVersions = new Map<string, number>();
const versionListeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...expanded]));
  } catch {
    /* localStorage unavailable; state stays in-memory for the session */
  }
}

export const wikiTreeState = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  isOpen(path: string): boolean {
    return expanded.has(path);
  },
  setOpen(path: string, open: boolean): void {
    if (open === expanded.has(path)) return;
    if (open) expanded.add(path);
    else expanded.delete(path);
    persist();
    listeners.forEach((l) => l());
  },
  // Expand many folders at once (e.g. every ancestor of a file opened from chat),
  // persisting and notifying a single time so the tree reveals the target in one
  // render pass instead of a flicker per level.
  openPaths(paths: string[]): void {
    let changed = false;
    for (const path of paths) {
      if (!expanded.has(path)) {
        expanded.add(path);
        changed = true;
      }
    }
    if (!changed) return;
    persist();
    listeners.forEach((l) => l());
  },
  // Directory refresh: subscribe to a dir's version and bump it after a mutation
  // so the rows listing that dir re-fetch. Separate listener set from the expand
  // state so a refresh doesn't churn every row's open/closed subscription.
  subscribeDir(listener: () => void): () => void {
    versionListeners.add(listener);
    return () => {
      versionListeners.delete(listener);
    };
  },
  dirVersion(path: string): number {
    return dirVersions.get(path) ?? 0;
  },
  bumpDirs(paths: string[]): void {
    for (const path of paths) dirVersions.set(path, (dirVersions.get(path) ?? 0) + 1);
    versionListeners.forEach((l) => l());
  },
};
