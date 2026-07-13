import { useEffect, useRef, useState } from "react";
import {
  closeArtifact,
  openArtifact,
  openWikiFile,
  useShell,
  WIKI_OPEN_MESSAGE,
} from "@/hooks/use-shell";
import { ActivityBar } from "@/components/activity-bar";
import { TermSidebar } from "@/components/term-sidebar";
import { WikiSidebar } from "@/components/wiki-sidebar";
import { WikiDetail } from "@/components/wiki-detail";
import { ArtifactDrawer } from "@/components/artifact-drawer";
import { Grid } from "@/components/grid";
import { Terminal } from "@/components/terminal";
import { SettingsPanel } from "@/components/settings-panel";

const ACTIVITY_BAR_WIDTH = 48; // w-12
const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 640;
const SIDEBAR_DEFAULT = 256;
const SIDEBAR_STORAGE_KEY = "termdeck:sidebarWidth";

const ARTIFACT_MIN = 360;
const ARTIFACT_DEFAULT = 720;
const ARTIFACT_STORAGE_KEY = "termdeck:artifactWidth";

const readStoredWidth = (): number => {
  const saved = Number(window.localStorage.getItem(SIDEBAR_STORAGE_KEY));
  return saved >= SIDEBAR_MIN && saved <= SIDEBAR_MAX ? saved : SIDEBAR_DEFAULT;
};

const readStoredArtifactWidth = (): number => {
  const saved = Number(window.localStorage.getItem(ARTIFACT_STORAGE_KEY));
  return saved >= ARTIFACT_MIN ? saved : ARTIFACT_DEFAULT;
};

// The TermDeck VS Code shell: activity bar (mode) -> resizable contextual subnav
// (session list / file tree) -> detail (terminal, grid, or rendered file). A
// clicked terminal file-path opens the artifact drawer on the right WITHOUT
// leaving the current view — the terminal stays mounted underneath.
export const Shell = () => {
  const { mode, sid, wikiPath, wikiLine, artifactPath, artifactLine } = useShell();
  const [sidebarWidth, setSidebarWidth] = useState(readStoredWidth);
  const [artifactWidth, setArtifactWidth] = useState(readStoredArtifactWidth);
  const [artifactExpanded, setArtifactExpanded] = useState(false);
  // "sidebar" or "artifact" while a divider is being dragged, else null.
  const draggingRef = useRef<null | "sidebar" | "artifact">(null);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (draggingRef.current === "sidebar") {
        const next = Math.min(
          SIDEBAR_MAX,
          Math.max(SIDEBAR_MIN, event.clientX - ACTIVITY_BAR_WIDTH),
        );
        setSidebarWidth(next);
      } else if (draggingRef.current === "artifact") {
        // The drawer is anchored right; its width grows as the handle moves left.
        const next = Math.min(
          window.innerWidth - 200,
          Math.max(ARTIFACT_MIN, window.innerWidth - event.clientX),
        );
        setArtifactWidth(next);
      }
    };
    const onUp = () => {
      const which = draggingRef.current;
      if (!which) return;
      draggingRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      if (which === "sidebar") {
        setSidebarWidth((width) => {
          window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(width));
          return width;
        });
      } else {
        setArtifactWidth((width) => {
          window.localStorage.setItem(ARTIFACT_STORAGE_KEY, String(width));
          return width;
        });
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startDrag = (which: "sidebar" | "artifact") => () => {
    draggingRef.current = which;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  };

  // A file clicked inside an embedded terminal tile (iframe) posts here; open it
  // in the artifact drawer (never navigate). Same-origin only.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; path?: string; line?: number | null } | null;
      if (data?.type === WIKI_OPEN_MESSAGE && typeof data.path === "string") {
        openArtifact(data.path, data.line ?? undefined);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Settings is a full-width detail surface with no contextual subnav.
  const hasSidebar = mode === "term" || mode === "wiki";

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      <ActivityBar mode={mode} />
      {hasSidebar ? (
        <>
          <aside
            className="flex shrink-0 flex-col border-r border-border bg-background"
            style={{ width: `${sidebarWidth}px` }}
          >
            {mode === "term" ? (
              <TermSidebar activeSid={sid} />
            ) : (
              <WikiSidebar activePath={wikiPath} />
            )}
          </aside>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            onMouseDown={startDrag("sidebar")}
            className="w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-ring/50"
          />
        </>
      ) : null}
      <main className="relative flex min-w-0 flex-1 flex-col">
        {mode === "settings" ? (
          <SettingsPanel />
        ) : mode === "term" ? (
          sid ? (
            <Terminal key={sid} />
          ) : (
            <Grid />
          )
        ) : wikiPath ? (
          <WikiDetail key={wikiPath} path={wikiPath} line={wikiLine} />
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-sm text-muted-foreground">
            Select a file from the tree.
          </div>
        )}

        {/* Artifact drawer overlays the right side so the terminal underneath
            keeps its size (no navigation, no reflow-to-zero). Full-screen mode
            covers the whole detail area; the terminal stays mounted behind it. */}
        {artifactPath ? (
          <div
            className="absolute inset-y-0 right-0 z-20 flex"
            style={{ width: artifactExpanded ? "100%" : `${artifactWidth}px`, maxWidth: "100%" }}
          >
            {!artifactExpanded && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize artifact"
                onMouseDown={startDrag("artifact")}
                className="w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-ring/50"
              />
            )}
            <div className="min-w-0 flex-1">
              <ArtifactDrawer
                path={artifactPath}
                line={artifactLine}
                expanded={artifactExpanded}
                onToggleExpand={() => setArtifactExpanded((v) => !v)}
                onOpenInWiki={() => {
                  openWikiFile(artifactPath, artifactLine ?? undefined);
                  closeArtifact();
                }}
                onClose={() => {
                  setArtifactExpanded(false);
                  closeArtifact();
                }}
              />
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
};
