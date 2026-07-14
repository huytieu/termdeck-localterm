import { useCallback, useEffect, useState } from "react";
import { LayoutGrid, Plus, SquareTerminal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createSession, fetchSessions, killSession, shortenCwd, type DeckSession } from "@/lib/deck-session";
import { openGridAll, openSession } from "@/hooks/use-shell";

const POLL_MS = 2500;

// Session activity → a minimal colored glyph. `running` = output flowing
// (working), `alive-quiet` = a foreground program is up but quiet (waiting on
// you — review), `ready` = back at the shell prompt (done / free). Solid ● = a
// live process; hollow ○ = idle.
const STATE_META: Record<string, { glyph: string; color: string; label: string; pulse?: boolean }> = {
  running: { glyph: "●", color: "text-amber-500", label: "Running", pulse: true },
  "alive-quiet": { glyph: "●", color: "text-[var(--primary)]", label: "Needs you" },
  ready: { glyph: "○", color: "text-emerald-500", label: "Idle · done" },
};

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

  const onKill = useCallback(async (id: string, title: string) => {
    if (!window.confirm(`Kill "${title || "shell"}"?`)) return;
    setSessions((prev) => prev.filter((x) => x.id !== id)); // optimistic
    await killSession(id).catch(() => {});
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
        {sessions.map((s) => {
          const meta = STATE_META[s.state] ?? STATE_META.ready;
          return (
            <div key={s.id} className="group relative">
              <button
                type="button"
                onClick={() => openSession(s.id)}
                title={`${s.title} — ${s.cwd} · ${meta.label}`}
                className={cn(
                  "flex w-full flex-col gap-0.5 py-1.5 pl-3 pr-8 text-left transition-colors",
                  s.id === activeSid ? "bg-accent text-accent-foreground" : "hover:bg-accent/40",
                )}
              >
                <span className="flex items-center gap-2 truncate font-mono text-xs">
                  <span
                    aria-label={meta.label}
                    title={meta.label}
                    className={cn("w-2 shrink-0 text-center text-[10px] leading-none", meta.color, meta.pulse && "animate-pulse")}
                  >
                    {meta.glyph}
                  </span>
                  <SquareTerminal className="size-3.5 shrink-0 text-muted-foreground/70" />
                  <span className="truncate">{s.title || s.shellName || "shell"}</span>
                </span>
                <span className="truncate pl-[26px] font-mono text-[10px] text-muted-foreground/70">
                  {shortenCwd(s.cwd)}
                </span>
              </button>
              <button
                type="button"
                aria-label="Kill session"
                title="Kill session"
                onClick={() => void onKill(s.id, s.title)}
                className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded text-muted-foreground/60 opacity-0 transition-opacity hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
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
