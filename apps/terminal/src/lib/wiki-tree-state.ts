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
};
