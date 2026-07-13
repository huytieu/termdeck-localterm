import { BookText, Maximize2, Minimize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WikiDetail } from "@/components/wiki-detail";

// The artifact drawer: a file opened to the SIDE (from a clicked terminal path)
// so the terminal the user is working in stays put — no navigation. A slim chrome
// strip carries full-screen + open-in-Wiki + close; the body is the same
// WikiDetail renderer the Wiki tab uses (markdown/HTML/source/edit/…).
export const ArtifactDrawer = ({
  path,
  line,
  expanded,
  onToggleExpand,
  onOpenInWiki,
  onClose,
}: {
  path: string;
  line: number | null;
  expanded: boolean;
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
      <WikiDetail key={path} path={path} line={line} />
    </div>
  </div>
);
