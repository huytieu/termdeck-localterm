import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SessionTile } from "@/components/session-tile";
import { UsageQuota } from "@/components/usage-quota";
import { fetchSessions, type DeckSession } from "@/lib/deck-session";

const POLL_MS = 3000;
const LAYOUT_KEY = "termdeck:gridLayout";
type Layout = "auto" | 1 | 2 | 3 | 4;
const LAYOUTS: Layout[] = ["auto", 1, 2, 3, 4];

const readLayout = (): Layout => {
  const saved = window.localStorage.getItem(LAYOUT_KEY);
  if (saved === "auto") return "auto";
  const n = Number(saved);
  return n >= 1 && n <= 4 ? (n as Layout) : "auto";
};

// "Grid all" detail view: every running session as a live interactive tile.
// Only the session LIST is polled (to add/remove tiles); each tile's terminal
// is a live iframe, so re-renders keyed by id keep the iframes mounted.
export const Grid = () => {
  const [sessions, setSessions] = useState<DeckSession[]>([]);
  const [layout, setLayout] = useState<Layout>(readLayout);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const tick = async () => {
      try {
        const list = await fetchSessions(controller.signal);
        if (!cancelled) setSessions(list);
      } catch {
        /* keep last known list */
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(timer);
    };
  }, []);

  const chooseLayout = (next: Layout) => {
    setLayout(next);
    window.localStorage.setItem(LAYOUT_KEY, String(next));
  };

  // Auto: near-square column count so tiles fill the area; fixed: N columns.
  const auto = layout === "auto";
  const cols = auto ? Math.max(1, Math.ceil(Math.sqrt(sessions.length || 1))) : layout;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
        <UsageQuota />
        <div className="flex items-center gap-1">
        <span className="mr-1 font-mono text-[10px] tracking-wide text-muted-foreground/70">LAYOUT</span>
        {LAYOUTS.map((option) => (
          <button
            key={String(option)}
            type="button"
            onClick={() => chooseLayout(option)}
            className={cn(
              "rounded px-2 py-0.5 font-mono text-[11px] transition-colors",
              layout === option
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
            )}
          >
            {option === "auto" ? "Auto" : option}
          </button>
        ))}
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="flex h-full items-center justify-center font-mono text-sm text-muted-foreground">
          No running sessions — use + in the sidebar to start one.
        </div>
      ) : (
        <div
          className={cn("min-h-0 flex-1 p-3", auto ? "overflow-hidden" : "overflow-auto")}
          style={{
            display: "grid",
            gap: "12px",
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridAutoRows: auto ? "minmax(0, 1fr)" : "minmax(260px, 1fr)",
          }}
        >
          {sessions.map((session) => (
            <SessionTile
              key={session.id}
              session={session}
              onKilled={(id) => setSessions((prev) => prev.filter((s) => s.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
};
