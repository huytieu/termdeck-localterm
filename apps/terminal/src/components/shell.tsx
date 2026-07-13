import { useEffect, useRef, useState } from "react";
import { openWikiFile, useShell, WIKI_OPEN_MESSAGE } from "@/hooks/use-shell";
import { ActivityBar } from "@/components/activity-bar";
import { TermSidebar } from "@/components/term-sidebar";
import { WikiSidebar } from "@/components/wiki-sidebar";
import { WikiDetail } from "@/components/wiki-detail";
import { Grid } from "@/components/grid";
import { Terminal } from "@/components/terminal";

const ACTIVITY_BAR_WIDTH = 48; // w-12
const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 640;
const SIDEBAR_DEFAULT = 256;
const SIDEBAR_STORAGE_KEY = "termdeck:sidebarWidth";

const readStoredWidth = (): number => {
  const saved = Number(window.localStorage.getItem(SIDEBAR_STORAGE_KEY));
  return saved >= SIDEBAR_MIN && saved <= SIDEBAR_MAX ? saved : SIDEBAR_DEFAULT;
};

// The TermDeck VS Code shell: activity bar (mode) -> resizable contextual subnav
// (session list / file tree) -> detail (terminal, grid, or rendered file).
export const Shell = () => {
  const { mode, sid, wikiPath } = useShell();
  const [sidebarWidth, setSidebarWidth] = useState(readStoredWidth);
  const draggingRef = useRef(false);

  // Drag the divider to resize the subnav; persist across reloads.
  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!draggingRef.current) return;
      const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, event.clientX - ACTIVITY_BAR_WIDTH));
      setSidebarWidth(next);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setSidebarWidth((width) => {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(width));
        return width;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startDrag = () => {
    draggingRef.current = true;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };

  // A file clicked inside an embedded terminal tile (iframe) posts here; open it
  // in the wiki view. Same-origin only.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; path?: string } | null;
      if (data?.type === WIKI_OPEN_MESSAGE && typeof data.path === "string") {
        openWikiFile(data.path);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      <ActivityBar mode={mode} />
      <aside
        className="flex shrink-0 flex-col border-r border-border bg-background"
        style={{ width: `${sidebarWidth}px` }}
      >
        {mode === "term" ? <TermSidebar activeSid={sid} /> : <WikiSidebar activePath={wikiPath} />}
      </aside>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onMouseDown={startDrag}
        className="w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-ring/50"
      />
      <main className="flex min-w-0 flex-1 flex-col">
        {mode === "term" ? (
          sid ? (
            <Terminal key={sid} />
          ) : (
            <Grid />
          )
        ) : wikiPath ? (
          <WikiDetail key={wikiPath} path={wikiPath} />
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-sm text-muted-foreground">
            Select a file from the tree.
          </div>
        )}
      </main>
    </div>
  );
};
