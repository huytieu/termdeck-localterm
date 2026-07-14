import { lazy, Suspense } from "react";
import { BookText, Columns2, Maximize2, Minimize2, PanelRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// Shared lazy chunk with shell.tsx: the file viewer stays out of the initial
// bundle so opening the app to a terminal doesn't load the markdown/shiki stack.
const WikiDetail = lazy(() =>
  import("@/components/wiki-detail").then((m) => ({ default: m.WikiDetail })),
);

export type ArtifactMode = "layover" | "push";

// The artifact drawer: a file opened to the SIDE (from a clicked terminal path)
// so the terminal the user is working in stays put — no navigation. A slim chrome
// strip carries mode (push/layover) + full-screen + open-in-Wiki + close; the body
// is the same WikiDetail renderer the Wiki tab uses (markdown/HTML/source/edit/…).
export const ArtifactDrawer = ({
  path,
  line,
  sourceSid,
  expanded,
  mode,
  onToggleMode,
  onToggleExpand,
  onOpenInWiki,
  onClose,
}: {
  path: string;
  line: number | null;
  sourceSid: string | null;
  expanded: boolean;
  mode: ArtifactMode;
  onToggleMode: () => void;
  onToggleExpand: () => void;
  onOpenInWiki: () => void;
  onClose: () => void;
}) => (
  <div className="flex h-full flex-col border-l border-border bg-background shadow-2xl">
    <div className="flex h-8 shrink-0 items-center gap-0.5 border-b border-border bg-muted/20 pl-3 pr-1">
      <span className="flex-1 truncate font-mono text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Artifact
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={mode === "push" ? "switch to layover" : "switch to push layout"}
        title={mode === "push" ? "Overlay (layover)" : "Push layout (split)"}
        onClick={onToggleMode}
      >
        {mode === "push" ? <PanelRight className="size-3.5" /> : <Columns2 className="size-3.5" />}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="open in wiki"
        title="Open in the Wiki tab"
        onClick={onOpenInWiki}
      >
        <BookText className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={expanded ? "collapse" : "full screen"}
        title={expanded ? "Collapse" : "Full screen"}
        onClick={onToggleExpand}
      >
        {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="close artifact"
        title="Close"
        onClick={onClose}
      >
        <X className="size-3.5" />
      </Button>
    </div>
    <div className="min-h-0 flex-1">
      <Suspense fallback={<div className="h-full bg-background" />}>
        <WikiDetail key={path} path={path} line={line} sourceSid={sourceSid} />
      </Suspense>
    </div>
  </div>
);
