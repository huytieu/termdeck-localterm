import { Maximize2, SquareTerminal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { killSession, sessionStateMeta, shortenCwd, type DeckSession } from "@/lib/deck-session";
import { openSession } from "@/hooks/use-shell";

// A grid tile = a LIVE, interactive terminal (iframe of the real terminal in
// embed mode). Type directly in the tile; maximize opens it full; the close
// button or right-click kills the session. Fills its grid cell (h-full) so the
// layout controls can pack tiles to use the space.
export const SessionTile = ({
  session,
  onKilled,
}: {
  session: DeckSession;
  onKilled: (id: string) => void;
}) => {
  const kill = () => {
    if (!window.confirm(`Kill "${session.title || session.shellName || session.id}"?`)) return;
    void killSession(session.id).then(() => onKilled(session.id));
  };

  const meta = sessionStateMeta(session.state);

  return (
    <div
      onContextMenu={(event) => {
        event.preventDefault();
        kill();
      }}
      className="group flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs">
          <span
            aria-label={meta.label}
            title={meta.label}
            className={cn("w-2 shrink-0 text-center text-[10px] leading-none", meta.color, meta.pulse && "animate-pulse")}
          >
            {meta.glyph}
          </span>
          <SquareTerminal className="size-3.5 shrink-0 text-muted-foreground/70" />
          <span className="truncate">{session.title || session.shellName || "shell"}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="truncate font-mono text-[10px] text-muted-foreground/60">
            {shortenCwd(session.cwd)}
          </span>
          <button
            type="button"
            onClick={() => openSession(session.id)}
            title="Open full"
            aria-label="Open full"
            className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
          >
            <Maximize2 className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={kill}
            title="Kill session"
            aria-label="Kill session"
            className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          >
            <X className="size-3.5" />
          </button>
        </span>
      </div>
      <iframe
        title={session.title || session.id}
        src={`/?embed=1&follow=1&sid=${encodeURIComponent(session.id)}`}
        className="min-h-0 flex-1 border-0 bg-black"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
};
