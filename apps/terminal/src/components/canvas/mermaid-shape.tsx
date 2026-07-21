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
import { MermaidDiagram } from "@/components/mermaid-diagram";

// A mermaid diagram as a first-class canvas shape: paste mermaid source (or a
// ```mermaid fence) onto the canvas and it renders as a live, theme-aware SVG.
// Double-click to edit the source in place; the diagram re-renders on commit.
export type MermaidShape = TLBaseShape<"mermaid", { w: number; h: number; code: string }>;

// Registers the shape in tldraw's global type map so editor.createShape /
// updateShape accept it (the v5 pattern for custom shapes).
declare module "@tldraw/tlschema" {
  interface TLGlobalShapePropsMap {
    mermaid: MermaidShape["props"];
  }
}

export class MermaidShapeUtil extends ShapeUtil<MermaidShape> {
  static override type = "mermaid" as const;
  static override props: RecordProps<MermaidShape> = {
    w: T.number,
    h: T.number,
    code: T.string,
  };

  getDefaultProps(): MermaidShape["props"] {
    return { w: 480, h: 360, code: "graph TD\n  A[Start] --> B[End]" };
  }

  override canEdit() {
    return true;
  }

  getGeometry(shape: MermaidShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override onResize(shape: MermaidShape, info: TLResizeInfo<MermaidShape>) {
    return resizeBox(shape, info);
  }

  component(shape: MermaidShape) {
    const isEditing = this.editor.getEditingShapeId() === shape.id;
    return (
      <HTMLContainer
        style={{ pointerEvents: isEditing ? "all" : "none" }}
        className="overflow-hidden rounded-lg border border-border bg-background"
      >
        {isEditing ? (
          <textarea
            className="h-full w-full resize-none bg-background p-3 font-mono text-[12px] leading-relaxed text-foreground outline-none"
            defaultValue={shape.props.code}
            autoFocus
            spellCheck={false}
            onPointerDown={stopEventPropagation}
            onBlur={(e) => {
              const code = e.currentTarget.value;
              if (code !== shape.props.code) {
                this.editor.updateShape<MermaidShape>({
                  id: shape.id,
                  type: "mermaid",
                  props: { code },
                });
              }
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-2 [&>div]:my-0 [&_svg]:max-h-full">
            <MermaidDiagram code={shape.props.code} />
          </div>
        )}
      </HTMLContainer>
    );
  }

  getIndicatorPath(shape: MermaidShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 8);
    return path;
  }
}
