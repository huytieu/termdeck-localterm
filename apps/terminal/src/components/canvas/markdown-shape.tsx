import {
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  T,
  resizeBox,
  stopEventPropagation,
  type RecordProps,
  type TLBaseShape,
  type TLResizeInfo,
} from "tldraw";
import { Markdown } from "@/components/markdown";

// A rendered markdown card on the canvas: paste a doc and it displays with the
// wiki's typography — headings, GFM tables, code blocks, and any ```mermaid
// fences inside the doc render as live diagrams inline (see markdown.tsx).
// Double-click to edit the source; the card re-renders on commit.
export type MarkdownCardShape = TLBaseShape<"mdcard", { w: number; h: number; md: string }>;

// Registers the shape in tldraw's global type map so editor.createShape /
// updateShape accept it (the v5 pattern for custom shapes).
declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    mdcard: MarkdownCardShape["props"];
  }
}

export class MarkdownCardShapeUtil extends ShapeUtil<MarkdownCardShape> {
  static override type = "mdcard" as const;
  static override props: RecordProps<MarkdownCardShape> = {
    w: T.number,
    h: T.number,
    md: T.string,
  };

  getDefaultProps(): MarkdownCardShape["props"] {
    return { w: 560, h: 440, md: "# Note\n\nDouble-click to edit." };
  }

  override canEdit() {
    return true;
  }

  getGeometry(shape: MarkdownCardShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override onResize(shape: MarkdownCardShape, info: TLResizeInfo<MarkdownCardShape>) {
    return resizeBox(shape, info);
  }

  component(shape: MarkdownCardShape) {
    const isEditing = this.editor.getEditingShapeId() === shape.id;
    return (
      <HTMLContainer
        style={{ pointerEvents: isEditing ? "all" : "none" }}
        className="overflow-hidden rounded-lg border border-border bg-background shadow-sm"
      >
        {isEditing ? (
          <textarea
            className="h-full w-full resize-none bg-background p-4 font-mono text-[12px] leading-relaxed text-foreground outline-none"
            defaultValue={shape.props.md}
            autoFocus
            spellCheck={false}
            onPointerDown={stopEventPropagation}
            onBlur={(e) => {
              const md = e.currentTarget.value;
              if (md !== shape.props.md) {
                this.editor.updateShape<MarkdownCardShape>({
                  id: shape.id,
                  type: "mdcard",
                  props: { md },
                });
              }
            }}
          />
        ) : (
          <div className="wiki-prose h-full w-full overflow-hidden p-4 text-[13px]">
            <Markdown>{shape.props.md}</Markdown>
          </div>
        )}
      </HTMLContainer>
    );
  }

  getIndicatorPath(shape: MarkdownCardShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 8);
    return path;
  }
}
