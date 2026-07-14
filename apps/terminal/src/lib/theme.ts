// Shared termyard chrome theme. The source of truth is a host-scoped `ty-theme`
// cookie (cookies are not port-scoped, so the terminal / wiki / kanban surfaces
// on the same host share one toggle). The no-flash boot script in index.html
// applies it before paint; this module drives the in-app toggle and keeps React
// in sync when the theme is flipped here or on another surface.

export type Theme = "light" | "dark";

const listeners = new Set<() => void>();

function cookieTheme(): Theme | null {
  const m = document.cookie.match(/(?:^|; )ty-theme=(light|dark)/);
  return m ? (m[1] as Theme) : null;
}

function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** What the shared signal resolves to (cookie, else OS preference). */
export function resolvedTheme(): Theme {
  return cookieTheme() ?? systemTheme();
}

/** The theme actually applied to the document right now. */
export function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function apply(t: Theme): void {
  const d = document.documentElement;
  d.classList.toggle("dark", t === "dark");
  d.style.colorScheme = t;
  listeners.forEach((l) => l());
}

export function setTheme(t: Theme): void {
  document.cookie = `ty-theme=${t};path=/;max-age=31536000;samesite=lax`;
  apply(t);
}

export function toggleTheme(): void {
  setTheme(currentTheme() === "dark" ? "light" : "dark");
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Adopt a flip made on another surface when this tab regains focus.
if (typeof window !== "undefined") {
  const sync = () => apply(resolvedTheme());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) sync();
  });
  window.addEventListener("pageshow", sync);
}
