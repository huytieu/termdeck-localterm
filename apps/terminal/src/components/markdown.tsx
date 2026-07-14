import { useEffect, useState, useSyncExternalStore } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openWikiFile } from "@/hooks/use-shell";
import { currentTheme, subscribeTheme } from "@/lib/theme";
import { detectLangId, tokenizeDiffLines, type SyntaxLine } from "@/utils/syntax-highlight";

// Fenced code block highlighted with the same shiki pipeline (github-light /
// dark-plus) the source viewer uses. Only rendered in the file view (sourcePath
// present); the streaming agent log keeps plain, lightweight code blocks.
function ShikiCode({ code, lang, className }: { code: string; lang: string | null; className?: string }) {
  const [tokens, setTokens] = useState<readonly SyntaxLine[] | null>(null);
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => "dark");
  useEffect(() => {
    const langId = lang ? detectLangId(`x.${lang}`) : null;
    if (!langId) {
      setTokens(null);
      return;
    }
    let cancelled = false;
    void tokenizeDiffLines(`md-fence.${lang}`, code.split("\n"), langId).then((r) => {
      if (!cancelled) setTokens(r);
    });
    return () => {
      cancelled = true;
    };
  }, [code, lang, theme]);
  const lines = code.replace(/\n$/, "").split("\n");
  return (
    <code className={className}>
      {lines.map((ln, i) => {
        const t = tokens?.[i]?.tokens;
        return (
          <span key={i} className="block whitespace-pre">
            {t
              ? t.map((tk, j) => (
                  <span key={j} style={{ color: tk.color || undefined, fontStyle: tk.fontStyle & 1 ? "italic" : undefined }}>
                    {tk.content}
                  </span>
                ))
              : ln || " "}
          </span>
        );
      })}
    </code>
  );
}

// Markdown renderer shared by the agent log and the Wiki file view. Colors use
// theme tokens so it adapts to light/dark. Two vault-flavored extras:
//   - Obsidian wikilinks `[[target|label]]` render as clickable links that open
//     the target file (resolved relative to the source file's directory).
//   - Inline code that is a CSS color (hex / rgb / hsl) gets a color swatch.

const HEX_RE = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** If the text is a CSS color literal, return it (for a swatch), else null. */
function colorValue(text: string): string | null {
  const t = text.trim();
  if (HEX_RE.test(t)) return t;
  if (/^(rgb|rgba|hsl|hsla)\([\d.,\s%/]+\)$/i.test(t)) return t;
  return null;
}

/** Rewrite `[[target|label]]` → `[label](wiki:target)` so remark makes a link.
 *  Code spans / fenced blocks are left untouched (wikilinks there are literal). */
function preprocessWikilinks(src: string): string {
  // Split on fenced blocks (```…```) and inline code (`…`); the capture group
  // keeps those delimiters as odd-indexed segments, which we pass through.
  return src
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part, i) => {
      if (i % 2 === 1) return part;
      return part.replace(
        /\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/g,
        (_m, target: string, label?: string) => {
          const t = target.trim();
          const l = (label ?? target).trim();
          return `[${l}](wiki:${encodeURIComponent(t)})`;
        },
      );
    })
    .join("");
}

function normalizePath(path: string): string {
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return "/" + out.join("/");
}

/** Resolve a wikilink target to an absolute path, relative to the source file. */
function resolveWiki(target: string, sourcePath: string): string {
  const clean = target.split("#")[0].split("^")[0].trim();
  const dir = sourcePath.slice(0, sourcePath.lastIndexOf("/"));
  const abs = normalizePath(clean.startsWith("/") ? clean : `${dir}/${clean}`);
  return /\.[a-z0-9]+$/i.test(abs) ? abs : `${abs}.md`;
}

// Coral text, subtle dark underline (decoration in --border), hover -> --primary-hover.
const LINK_CLASS =
  "text-primary underline decoration-1 underline-offset-2 decoration-border transition-colors hover:text-[var(--primary-hover)] hover:decoration-current";

/** Leading-emoji test for the callout paragraph branch. */
const LEADING_EMOJI_RE = /^\p{Extended_Pictographic}/u;

function makeComponents(sourcePath?: string): Components {
  return {
    // Real semantic heading tags (was a shared HEADING_CLASS <div> for all six
    // levels — CSS h1..h4 selectors couldn't match, so there was no visual
    // hierarchy). Sizes/weights/margins follow the memo reading-serif scale;
    // asymmetric margins (more above than below) give correct section rhythm.
    h1: ({ children }) => (
      <h1 className="mt-[22px] mb-8 text-[35px] font-semibold leading-[42px] tracking-[-0.025em] text-foreground first:mt-0">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="mt-7 mb-2 text-2xl font-semibold leading-[30px] tracking-[-0.017em] text-foreground">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="mt-[22px] mb-1 text-[19px] font-semibold leading-[26px] tracking-[-0.016em] text-foreground">
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className="mt-[18px] mb-1 text-base font-semibold leading-[22px] tracking-[-0.012em] text-foreground">
        {children}
      </h4>
    ),
    h5: ({ children }) => (
      <h5 className="mt-4 mb-1 text-[15px] font-semibold tracking-[-0.012em] text-foreground">
        {children}
      </h5>
    ),
    h6: ({ children }) => (
      <h6 className="mt-4 mb-1 text-[15px] font-semibold tracking-[-0.012em] text-foreground">
        {children}
      </h6>
    ),
    p: ({ children }) => {
      // Emoji-led paragraphs render as a callout: faint coral tint + 3px coral
      // left rule, keeping the emoji inline as the leading glyph.
      const nodes = Array.isArray(children) ? children : [children];
      const firstText = typeof nodes[0] === "string" ? nodes[0] : "";
      const isCallout = LEADING_EMOJI_RE.test(firstText);
      return isCallout ? (
        <div
          className="my-3 rounded-md border-l-[3px] border-primary px-4 py-3"
          style={{ background: "color-mix(in oklab, var(--primary) 8%, transparent)" }}
        >
          {children}
        </div>
      ) : (
        <p className="my-4 leading-relaxed">{children}</p>
      );
    },
    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    del: ({ children }) => <del className="text-muted-foreground line-through">{children}</del>,
    a: ({ href, children }) => {
      if (href?.startsWith("wiki:")) {
        const target = decodeURIComponent(href.slice("wiki:".length));
        if (!sourcePath) {
          // No file context (e.g. agent log) — show the label, not clickable.
          return <span className={LINK_CLASS}>{children}</span>;
        }
        return (
          <button
            type="button"
            className={LINK_CLASS}
            title={target}
            onClick={() => openWikiFile(resolveWiki(target, sourcePath))}
          >
            {children}
          </button>
        );
      }
      return (
        <a href={href} target="_blank" rel="noreferrer noopener" className={LINK_CLASS}>
          {children}
        </a>
      );
    },
    // list-none + a coral `→` ::before marker (see index.css `.wiki-prose ul`);
    // ordered-list markers are tinted coral via `.wiki-prose ol > li::marker`.
    ul: ({ children }) => <ul className="my-2 list-none space-y-1.5 pl-[1.35em]">{children}</ul>,
    ol: ({ children }) => <ol className="my-2 list-decimal space-y-1.5 pl-[1.5em]">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className="my-3 border-l-[3px] border-border pl-4 italic text-muted-foreground">
        {children}
      </blockquote>
    ),
    hr: () => <hr className="my-6 border-0 border-t border-border" />,
    pre: ({ children }) => (
      <pre className="my-3 overflow-x-auto rounded-lg bg-[var(--code-bg)] p-3.5 font-mono text-[0.85em] leading-relaxed text-foreground">
        {children}
      </pre>
    ),
    img: ({ src, alt }) => (
      // eslint-disable-next-line jsx-a11y/alt-text -- alt comes through as a prop, may be undefined for decorative images
      <img src={src} alt={alt} className="my-3 w-full rounded-lg border border-border" />
    ),
    code: ({ className, children, ...rest }) => {
      const text = Array.isArray(children) ? children.join("") : String(children ?? "");
      // react-markdown v9 gives no `inline` flag (nodes are hast elements), so a
      // fenced block is detected by its language-* class or a newline in the body.
      const isFenced = /language-[\w-]+/.test(className || "") || text.includes("\n");
      if (isFenced) {
        // In the file view (sourcePath), highlight with shiki; in the streaming
        // log keep it plain so the <pre> styles it lightly.
        if (sourcePath) {
          const lang = /language-([\w-]+)/.exec(className || "")?.[1] ?? null;
          return <ShikiCode code={text} lang={lang} className={className} />;
        }
        return (
          <code className={className} {...rest}>
            {children}
          </code>
        );
      }
      const color = colorValue(text);
      if (color) {
        return (
          <code className="inline-flex items-center gap-1 rounded bg-muted px-1 py-0.5 font-mono text-foreground" {...rest}>
            <span
              aria-hidden
              className="inline-block size-2.5 shrink-0 rounded-[3px] border border-border"
              style={{ background: color }}
            />
            {children}
          </code>
        );
      }
      return (
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.88em] text-foreground" {...rest}>
          {children}
        </code>
      );
    },
    table: ({ children }) => (
      <div className="my-3 overflow-x-auto">
        <table className="border-collapse text-[0.9em]">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="text-muted-foreground">{children}</thead>,
    tr: ({ children }) => <tr className="hover:bg-muted/50">{children}</tr>,
    th: ({ children }) => (
      <th className="border border-border px-2.5 py-1.5 text-left font-sans text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {children}
      </th>
    ),
    td: ({ children }) => <td className="border border-border px-2.5 py-1.5">{children}</td>,
  };
}

// Cache the agent-log components (no sourcePath) so streaming re-renders reuse them.
const logComponents = makeComponents();

export const Markdown = ({
  children,
  sourcePath,
}: {
  children: string;
  sourcePath?: string;
}) => (
  <div className="whitespace-normal break-words">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={sourcePath ? makeComponents(sourcePath) : logComponents}
    >
      {preprocessWikilinks(children)}
    </ReactMarkdown>
  </div>
);
