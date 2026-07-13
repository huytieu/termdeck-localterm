import { useCallback, useEffect, useState } from "react";
import { LayoutGrid, Plus, SquareTerminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createSession, fetchSessions, shortenCwd, type DeckSession } from "@/lib/deck-session";
import { openGridAll, openSession } from "@/hooks/use-shell";

const POLL_MS = 2500;

// Term-mode subnav: the session list plus New session and a "Grid all" entry
// that shows every session as live tiles in the detail pane.
export const TermSidebar = ({ activeSid }: { activeSid: string | null }) => {
  const [sessions, setSessions] = useState<DeckSession[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const tick = async () => {
      try {
        const list = await fetchSessions(controller.signal);
        if (!cancelled) setSessions(list);
      } catch {
        /* keep last known list on a transient failure */
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

  const onNew = useCallback(async () => {
    setCreating(true);
    try {
      openSession(await createSession());
    } finally {
      setCreating(false);
    }
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between px-3">
        <span className="font-mono text-[11px] font-semibold tracking-wide text-muted-foreground">
          TERMINALS
        </span>
        <button
          type="button"
          onClick={() => void onNew()}
          disabled={creating}
          aria-label="New session"
          title="New session"
          className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          <Plus className="size-4" />
        </button>
      </div>

      <button
        type="button"
        onClick={openGridAll}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 text-left font-mono text-xs transition-colors",
          activeSid === null ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
        )}
      >
        <LayoutGrid className="size-3.5 shrink-0" />
        Grid — all sessions
      </button>

      <div className="min-h-0 flex-1 overflow-auto py-1">
        {sessions.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => openSession(s.id)}
            title={`${s.title} — ${s.cwd}`}
            className={cn(
              "flex w-full flex-col gap-0.5 px-3 py-1.5 text-left transition-colors",
              s.id === activeSid ? "bg-accent text-accent-foreground" : "hover:bg-accent/40",
            )}
          >
            <span className="flex items-center gap-2 truncate font-mono text-xs">
              <SquareTerminal className="size-3.5 shrink-0 text-muted-foreground/70" />
              <span className="truncate">{s.title || s.shellName || "shell"}</span>
            </span>
            <span className="truncate pl-[22px] font-mono text-[10px] text-muted-foreground/70">
              {shortenCwd(s.cwd)}
            </span>
          </button>
        ))}
        {sessions.length === 0 && (
          <div className="px-3 py-6 text-center">
            <Button variant="outline" size="sm" onClick={() => void onNew()} disabled={creating}>
              <Plus /> New session
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
