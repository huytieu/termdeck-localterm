import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Claude usage quota for the term header: session (5-hour) + weekly limits,
// read from ~/.claude/oauth-usage-cache.json (the same file Claude Code's
// statusline uses). Shows PERCENT REMAINING (100 − utilization), a 5-segment
// bar, and the reset countdown — matching the statusline's s:/w: readout.
// Read via GET /api/file/text (no session spawn, no daemon change); $HOME is
// derived from the wiki root (macOS /Users/<user>).

interface Limit {
  left: number;
  reset?: string;
}
interface Usage {
  session: Limit;
  weekly: Limit;
}

function fmtReset(iso?: string): string {
  if (!iso) return "—";
  const t = new Date(iso.replace(/\.\d+/, "")).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = t - Date.now();
  if (diff <= 0) return "0m";
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (d > 0) return `${d}d${h}h`;
  if (h > 0) return `${h}h${m}m`;
  return `${m}m`;
}

function bar(left: number): string {
  const filled = Math.max(0, Math.min(5, Math.round(left / 20)));
  return "▰".repeat(filled) + "▱".repeat(5 - filled);
}

function colorFor(left: number): string {
  if (left <= 10) return "text-red-500";
  if (left <= 30) return "text-amber-500";
  return "text-emerald-500";
}

const Meter = ({ label, full, data }: { label: string; full: string; data: Limit }) => (
  <span
    className="flex items-center gap-1"
    title={`${full}: ${Math.round(data.left)}% remaining · resets in ${fmtReset(data.reset)}`}
  >
    <span className="text-muted-foreground/70">{label}:</span>
    <span className={colorFor(data.left)}>{bar(data.left)}</span>
    <span className={cn("tabular-nums", colorFor(data.left))}>{Math.round(data.left)}%</span>
    <span className="text-muted-foreground/60">↻{fmtReset(data.reset)}</span>
  </span>
);

export const UsageQuota = () => {
  const [home, setHome] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/wiki/root")
      .then((r) => r.json())
      .then(({ root }: { root?: string }) => {
        if (cancelled) return;
        // macOS $HOME is the first two path segments (/Users/<user>).
        const h = "/" + String(root ?? "").split("/").filter(Boolean).slice(0, 2).join("/");
        if (h.length > 1) setHome(h);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!home) return;
    let cancelled = false;
    const load = async () => {
      try {
        const url = new URL("/api/file/text", window.location.href);
        url.searchParams.set("cwd", home);
        url.searchParams.set("path", ".claude/oauth-usage-cache.json");
        const body = (await (await fetch(url)).json()) as { kind?: string; content?: string };
        if (body.kind !== "text" || !body.content) return;
        const d = JSON.parse(body.content) as {
          five_hour?: { utilization?: number; resets_at?: string };
          seven_day?: { utilization?: number; resets_at?: string };
        };
        if (cancelled) return;
        setUsage({
          session: { left: 100 - (d.five_hour?.utilization ?? 0), reset: d.five_hour?.resets_at },
          weekly: { left: 100 - (d.seven_day?.utilization ?? 0), reset: d.seven_day?.resets_at },
        });
      } catch {
        /* cache missing / unreadable → hide the meter */
      }
    };
    void load();
    const t = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [home]);

  if (!usage) return null;

  return (
    <div className="flex items-center gap-3 font-mono text-[11px]">
      <Meter label="s" full="Session quota (5h)" data={usage.session} />
      <span className="text-border">·</span>
      <Meter label="w" full="Weekly quota" data={usage.weekly} />
    </div>
  );
};
