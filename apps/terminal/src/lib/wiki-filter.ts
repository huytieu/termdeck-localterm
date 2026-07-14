// Pure filter helpers for the Wiki file tree: extension chips (OR'd), a
// glob/substring pattern, a hide-dotfiles toggle, and a files-only toggle.

export interface WikiFilter {
  exts: string[];
  pattern: string;
  hideDotfiles: boolean;
  filesOnly: boolean;
}

export const EMPTY_FILTER: WikiFilter = {
  exts: [],
  pattern: "",
  hideDotfiles: true,
  filesOnly: false,
};

const STORAGE_KEY = "lt-wiki-filter";

export function loadFilter(): WikiFilter {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!v || typeof v !== "object") return EMPTY_FILTER;
    return {
      exts: Array.isArray(v.exts) ? v.exts : [],
      pattern: typeof v.pattern === "string" ? v.pattern : "",
      hideDotfiles: v.hideDotfiles !== false,
      filesOnly: v.filesOnly === true,
    };
  } catch {
    return EMPTY_FILTER;
  }
}

export function saveFilter(f: WikiFilter): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
  } catch {
    /* ignore */
  }
}

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(i + 1).toLowerCase() : "";
}

function globToRegExp(glob: string): RegExp {
  const esc = glob
    .trim()
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${esc}$`, "i");
}

/** Comma-separated terms, OR'd. Glob chars → glob match; else substring. */
export function matchesPattern(name: string, pattern: string): boolean {
  const parts = pattern
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return false;
  return parts.some((p) =>
    p.includes("*") || p.includes("?")
      ? globToRegExp(p).test(name)
      : name.toLowerCase().includes(p.toLowerCase()),
  );
}

/** Does a FILE pass the ext/pattern filter? (chips and pattern OR'd) */
export function fileMatches(name: string, f: WikiFilter): boolean {
  const active = f.exts.length > 0 || f.pattern.trim() !== "";
  if (!active) return true;
  if (f.exts.length > 0 && f.exts.includes(extOf(name))) return true;
  if (f.pattern.trim() !== "" && matchesPattern(name, f.pattern)) return true;
  return false;
}
