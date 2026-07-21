import { createShapeId, defaultHandleExternalTextContent, type Editor } from "tldraw";
import type { MarkdownCardShape } from "@/components/canvas/markdown-shape";
import type { MermaidShape } from "@/components/canvas/mermaid-shape";

// Paste routing for the canvas: mermaid source becomes a live diagram shape,
// markdown becomes a rendered card, anything else falls through to tldraw's
// default text handling. Detection is conservative — plain prose must never
// get hijacked into a card.

const MERMAID_FIRST_LINE =
  /^(graph\s+(TB|TD|BT|RL|LR)\b|flowchart\s|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|journey\b|gantt\b|pie(\s|$)|mindmap\b|timeline\b|quadrantChart|gitGraph|sankey(-beta)?|xychart(-beta)?|block-beta|kanban\b|architecture-beta|requirementDiagram|packet-beta|C4Context)/;

// A ```mermaid fence (with nothing else around it), or bare mermaid source.
export function extractMermaid(text: string): string | null {
  const fenced = /^```mermaid\s*\n([\s\S]*?)\n```\s*$/.exec(text);
  if (fenced) return fenced[1];
  const firstLine = text.split("\n").find((l) => l.trim() !== "");
  return firstLine && MERMAID_FIRST_LINE.test(firstLine.trim()) ? text : null;
}

// Multi-line text with at least one strong markdown signal. Bare lists are on
// purpose NOT enough — agents and humans paste plain-text lists constantly.
export function looksLikeMarkdown(text: string): boolean {
  if (!text.includes("\n")) return false;
  return (
    /^#{1,6}\s+\S/m.test(text) || // heading
    /^```/m.test(text) || // fenced code block
    /^\|.+\|\s*\n\s*\|[\s:|-]+\|/m.test(text) || // GFM table header + rule
    /\[[^\]]+\]\([^)\s]+\)/.test(text) || // link
    /\*\*[^*\n]+\*\*/.test(text) // bold
  );
}

export function registerCanvasPasteHandlers(editor: Editor): void {
  editor.registerExternalContentHandler("text", (info) => {
    const point = info.point ?? editor.getViewportPageBounds().center;
    const text = info.text.trim();

    const mermaid = extractMermaid(text);
    if (mermaid) {
      const id = createShapeId();
      editor.createShape<MermaidShape>({
        id,
        type: "mermaid",
        x: point.x - 240,
        y: point.y - 180,
        props: { w: 480, h: 360, code: mermaid },
      });
      editor.select(id);
      return;
    }

    if (looksLikeMarkdown(text)) {
      const id = createShapeId();
      editor.createShape<MarkdownCardShape>({
        id,
        type: "mdcard",
        x: point.x - 280,
        y: point.y - 220,
        props: { w: 560, h: 440, md: text },
      });
      editor.select(id);
      return;
    }

    return defaultHandleExternalTextContent(editor, info);
  });
}
