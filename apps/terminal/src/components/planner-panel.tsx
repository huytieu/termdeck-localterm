import { useEffect, useRef, useState } from "react";
import { CalendarCheck, RefreshCw, ExternalLink } from "lucide-react";

// DayDeck lives on the Thor VM; an SSH tunnel (LaunchAgent com.daydeck.tunnel) maps it to
// 127.0.0.1:3500 here. Embedding it rather than re-implementing keeps ONE source of truth
// for todos — the VM's SQLite is canonical, and the vault mirror flows from it.
const PLANNER_URL = "http://127.0.0.1:3500";

type Health = "checking" | "up" | "down";

export const PlannerPanel = () => {
  const [health, setHealth] = useState<Health>("checking");
  const [nonce, setNonce] = useState(0);
  const frame = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      try {
        // DayDeck sends no CORS headers, so a normal fetch from this origin is
        // blocked even when the tunnel is up. An opaque no-cors fetch resolves
        // for any HTTP response and only rejects on a real network error —
        // exactly the "is the tunnel alive" signal we need.
        await fetch(`${PLANNER_URL}/api/health`, { cache: "no-store", mode: "no-cors" });
        if (!cancelled) setHealth("up");
      } catch {
        if (!cancelled) setHealth("down");
      }
    };
    void ping();
    const t = window.setInterval(ping, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [nonce]);

  if (health === "down") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background px-6 text-center font-sans text-[14px] text-muted-foreground">
        <CalendarCheck className="size-6 text-muted-foreground/60" />
        <div className="max-w-sm leading-relaxed">
          DayDeck is not reachable at <code className="text-foreground">127.0.0.1:3500</code>.
          <br />
          The tunnel to the VM is probably down.
        </div>
        <code className="rounded bg-muted px-2 py-1 text-[12px] text-foreground">
          launchctl kickstart -k gui/$(id -u)/com.daydeck.tunnel
        </code>
        <button
          type="button"
          onClick={() => setNonce((n) => n + 1)}
          className="mt-1 flex items-center gap-1.5 rounded border border-border px-3 py-1 text-[13px] transition-colors hover:text-foreground"
        >
          <RefreshCw className="size-3.5" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 font-sans text-[12px] text-muted-foreground">
        <CalendarCheck className="size-3.5" />
        <span className="text-foreground">Planner</span>
        <span className="opacity-60">DayDeck · Thor VM</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            title="Reload planner"
            onClick={() => setNonce((n) => n + 1)}
            className="rounded p-1 transition-colors hover:text-foreground"
          >
            <RefreshCw className="size-3.5" />
          </button>
          <a
            href={PLANNER_URL}
            target="_blank"
            rel="noreferrer"
            title="Open in a new tab"
            className="rounded p-1 transition-colors hover:text-foreground"
          >
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>
      <iframe
        ref={frame}
        key={nonce}
        src={PLANNER_URL}
        title="DayDeck planner"
        className="h-full w-full flex-1 border-0"
      />
    </div>
  );
};
