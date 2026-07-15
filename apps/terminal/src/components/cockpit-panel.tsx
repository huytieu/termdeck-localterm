import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { openFileInWiki, useShell } from "@/hooks/use-shell";
import { fetchCockpit, type CockpitData } from "@/utils/fetch-cockpit";

const POLL_MS = 6000;
const COLLAPSE_KEY = "termdeck:cockpitCollapsed";

const readCollapsed = (): boolean => {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
};

const isExternal = (target: string): boolean => /^https?:\/\//i.test(target);

const hasContent = (data: CockpitData): boolean =>
  data.found === true &&
  ((data.progress?.length ?? 0) > 0 ||
    (data.working?.length ?? 0) > 0 ||
    (data.context?.length ?? 0) > 0);

// The session cockpit: renders the review-cockpit doc (Progress / Working folder
// / Context) for the terminal's live cwd in the top-right, so an agent-driven
// session shows its live plan in place. Best-effort: renders nothing when the
// cwd has no cockpit doc, and never blocks the terminal.
export const CockpitPanel = ({ cwd }: { cwd: string | null }) => {
  const { sid } = useShell();
  const [data, setData] = useState<CockpitData>({ found: false });
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;

  const refresh = useCallback((signal?: AbortSignal) => {
    fetchCockpit(cwdRef.current, signal).then((next) => {
      if (!signal?.aborted) setData(next);
    });
  }, []);

  useEffect(() => {
    if (!cwd) {
      setData({ found: false });
      return;
    }
    const controller = new AbortController();
    refresh(controller.signal);
    const timer = window.setInterval(() => refresh(), POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [cwd, refresh]);

  const toggleCollapsed = () =>
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* storage disabled */
      }
      return next;
    });

  if (!hasContent(data)) return null;

  const openDoc = () => {
    if (data.path) openFileInWiki(data.path, undefined, sid);
  };
  const openTarget = (target: string | null) => {
    if (!target) {
      openDoc();
      return;
    }
    if (isExternal(target)) {
      window.open(target, "_blank", "noopener,noreferrer");
      return;
    }
    openFileInWiki(target, undefined, sid);
  };

  const done = data.progress?.filter((p) => p.done).length ?? 0;
  const total = data.progress?.length ?? 0;

  return (
    <div className="pointer-events-auto mt-1 w-[19rem] max-w-[calc(100dvw-1.5rem)] overflow-hidden rounded-md border border-border/60 bg-background/80 text-[11px] text-muted-foreground shadow-xs backdrop-blur-md">
      <button
        type="button"
        onClick={toggleCollapsed}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left transition-colors hover:bg-muted/40"
        title={collapsed ? "Expand cockpit" : "Collapse cockpit"}
      >
        {collapsed ? (
          <ChevronRight className="size-3.5 shrink-0" />
        ) : (
          <ChevronDown className="size-3.5 shrink-0" />
        )}
        <span className="truncate font-medium text-foreground">
          🧭 {data.title ?? "Cockpit"}
        </span>
        {total > 0 && (
          <span className="ml-auto shrink-0 tabular-nums text-muted-foreground/80">
            {done}/{total}
          </span>
        )}
      </button>

      {!collapsed && (
        <div className="max-h-[60dvh] overflow-y-auto px-2 pb-2 [scrollbar-width:thin]">
          {data.updated && (
            <div className="pb-1.5 text-[10px] text-muted-foreground/70">
              Updated {data.updated}
            </div>
          )}

          {(data.progress?.length ?? 0) > 0 && (
            <ul className="flex flex-col gap-0.5 py-0.5">
              {data.progress?.map((item, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={openDoc}
                    className="flex w-full items-start gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted/40"
                    title="Open the cockpit doc"
                  >
                    <span className="shrink-0 leading-4">{item.done ? "✅" : "⬜️"}</span>
                    <span
                      className={cn(
                        "min-w-0 leading-4",
                        item.done && "text-muted-foreground/60 line-through",
                      )}
                    >
                      {item.text}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {(data.working?.length ?? 0) > 0 && (
            <div className="mt-2 border-t border-border/40 pt-1.5">
              <div className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
                📁 Working folder
              </div>
              <ul className="flex flex-col gap-0.5">
                {data.working?.map((row, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => openTarget(row.target)}
                      disabled={!row.target}
                      className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted/40 disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent"
                      title={row.target ?? undefined}
                    >
                      <span className="min-w-0 flex-1 truncate text-foreground/90">{row.label}</span>
                      {row.target && isExternal(row.target) && (
                        <ExternalLink className="size-3 shrink-0 text-muted-foreground/60" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(data.context?.length ?? 0) > 0 && (
            <div className="mt-2 border-t border-border/40 pt-1.5">
              <div className="px-1 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
                🔌 Context
              </div>
              <ul className="flex flex-col gap-0.5 px-1">
                {data.context?.map((line, i) => (
                  <li key={i} className="leading-4 text-muted-foreground/85">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
