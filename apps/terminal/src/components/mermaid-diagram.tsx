import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { currentTheme, subscribeTheme } from "@/lib/theme";

// Renders mermaid source as an inline SVG diagram, following the shared
// ty-theme cookie. mermaid is ~1.5MB gzipped, so it stays a dynamic import —
// the chunk loads the first time a diagram actually renders, never before.
// Invalid source (common while agent output is still streaming) falls back to
// the raw code in a quiet block instead of an error flash.
let mermaidModule: Promise<typeof import("mermaid")> | null = null;
const loadMermaid = () => (mermaidModule ??= import("mermaid"));

export const MermaidDiagram = ({ code, className }: { code: string; className?: string }) => {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => "dark" as const);
  const reactId = useId();
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // Renders are async and code/theme can change mid-flight (streaming agent
  // logs); the generation counter drops stale results instead of racing.
  const generation = useRef(0);

  useEffect(() => {
    const gen = ++generation.current;
    // mermaid.render requires a DOM-unique, CSS-safe element id.
    const id = `mmd-${reactId.replace(/[^a-zA-Z0-9]/g, "")}-${gen}`;
    let cancelled = false;
    loadMermaid()
      .then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: theme === "dark" ? "dark" : "default",
        });
        const out = await mermaid.render(id, code);
        if (!cancelled && generation.current === gen) {
          setSvg(out.svg);
          setFailed(false);
        }
      })
      .catch(() => {
        // mermaid can leave its temp error element behind on a parse failure.
        document.getElementById(`d${id}`)?.remove();
        if (!cancelled && generation.current === gen) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code, theme, reactId]);

  if (failed || !svg) {
    return (
      <pre
        className={`my-3 overflow-x-auto rounded-lg bg-[var(--code-bg)] p-3.5 font-mono text-[0.85em] leading-relaxed ${failed ? "text-muted-foreground" : "text-transparent"} ${className ?? ""}`}
      >
        {code}
      </pre>
    );
  }
  return (
    <div
      className={`my-3 flex w-full justify-center overflow-x-auto [&_svg]:h-auto [&_svg]:max-w-full ${className ?? ""}`}
      // eslint-disable-next-line react/no-danger -- SVG produced by mermaid with securityLevel: strict
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};
