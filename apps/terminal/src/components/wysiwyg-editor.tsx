import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { Markdown } from "tiptap-markdown";
import {
  Bold,
  Code,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Strikethrough,
  Table as TableIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Notion/Obsidian-style rich-text editor for markdown files. Frontmatter is
// split off and preserved VERBATIM (TipTap only edits the body); on every
// change the body is re-serialized to markdown and the verbatim frontmatter is
// re-prepended, so `onChange` always gets a complete, saveable file. Markdown
// shortcuts (`# `, `- `, `> `, ``` ) and Cmd+B/I work inline; a `/` at the
// start of a line opens a block-insert menu; the toolbar is for discoverability.
// Tables + task lists round-trip so notes aren't lost.

function splitFrontmatter(raw: string): { fm: string; body: string } {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(raw);
  const fm = m ? m[0] : "";
  return { fm, body: raw.slice(fm.length) };
}

// TipTap's markdown serializer escapes `[` / `]`, which corrupts Obsidian
// wikilinks (`[[x]]` → `\[\[x\]\]`), and can leave a run of blank lines when
// blocks are deleted. Undo the wikilink escape and collapse 3+ blank lines to
// the single blank line markdown actually renders — both are cosmetic-only
// normalizations that keep the file diff quiet without changing meaning.
function normalizeSerialized(md: string): string {
  return md
    .replace(/\\\[\\\[/g, "[[")
    .replace(/\\\]\\\]/g, "]]")
    .replace(/\n{3,}/g, "\n\n");
}

const ToolbarButton = ({
  onClick,
  active,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    className={cn(
      "flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
      active && "bg-secondary text-foreground",
    )}
  >
    {children}
  </button>
);

const Toolbar = ({ editor }: { editor: Editor }) => {
  const sep = <span className="mx-0.5 h-4 w-px bg-border" />;
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-3 py-1.5">
      <ToolbarButton label="Bold (⌘B)" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Italic (⌘I)" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
        <Strikethrough className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Inline code" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
        <Code className="size-4" />
      </ToolbarButton>
      {sep}
      <ToolbarButton label="Heading 1" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
        <Heading1 className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        <Heading3 className="size-4" />
      </ToolbarButton>
      {sep}
      <ToolbarButton label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Task list" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <ListTodo className="size-4" />
      </ToolbarButton>
      {sep}
      <ToolbarButton label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Code block" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
        <Code2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Link"
        active={editor.isActive("link")}
        onClick={() => {
          if (editor.isActive("link")) {
            editor.chain().focus().unsetLink().run();
            return;
          }
          const url = window.prompt("Link URL");
          if (url) editor.chain().focus().setLink({ href: url }).run();
        }}
      >
        <Link2 className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Insert table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        <TableIcon className="size-4" />
      </ToolbarButton>
    </div>
  );
};

// A `/` block-insert command. `run` receives an editor chain already focused
// with the `/query` text deleted, so each command only has to add its node.
interface SlashCommand {
  title: string;
  hint: string;
  keywords: string;
  icon: React.ReactNode;
  run: (editor: Editor) => void;
}

const ic = "size-4 text-muted-foreground";
const SLASH_COMMANDS: SlashCommand[] = [
  { title: "Heading 1", hint: "#", keywords: "h1 title big", icon: <Heading1 className={ic} />, run: (e) => e.chain().focus().setNode("heading", { level: 1 }).run() },
  { title: "Heading 2", hint: "##", keywords: "h2 subtitle", icon: <Heading2 className={ic} />, run: (e) => e.chain().focus().setNode("heading", { level: 2 }).run() },
  { title: "Heading 3", hint: "###", keywords: "h3 section", icon: <Heading3 className={ic} />, run: (e) => e.chain().focus().setNode("heading", { level: 3 }).run() },
  { title: "Bullet list", hint: "-", keywords: "unordered ul bullet", icon: <List className={ic} />, run: (e) => e.chain().focus().toggleBulletList().run() },
  { title: "Numbered list", hint: "1.", keywords: "ordered ol number", icon: <ListOrdered className={ic} />, run: (e) => e.chain().focus().toggleOrderedList().run() },
  { title: "Task list", hint: "[ ]", keywords: "todo checkbox check", icon: <ListTodo className={ic} />, run: (e) => e.chain().focus().toggleTaskList().run() },
  { title: "Quote", hint: ">", keywords: "blockquote callout", icon: <Quote className={ic} />, run: (e) => e.chain().focus().toggleBlockquote().run() },
  { title: "Code block", hint: "```", keywords: "code fence pre", icon: <Code2 className={ic} />, run: (e) => e.chain().focus().toggleCodeBlock().run() },
  { title: "Table", hint: "grid", keywords: "table grid rows", icon: <TableIcon className={ic} />, run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { title: "Divider", hint: "---", keywords: "hr rule separator line", icon: <Minus className={ic} />, run: (e) => e.chain().focus().setHorizontalRule().run() },
];

interface SlashState {
  from: number;
  to: number;
  query: string;
  left: number;
  top: number;
}

// Read the `/command` context at the caret: a `/` at the very start of an empty
// textblock, or right after whitespace, in a paragraph. Returns the doc range
// covering `/query` (so it can be deleted before running the command) and the
// caret's viewport coords for positioning the popup. Null = no active menu.
function readSlash(editor: Editor): SlashState | null {
  const { state, view } = editor;
  const { selection } = state;
  if (!selection.empty) return null;
  const $from = selection.$from;
  if ($from.parent.type.name !== "paragraph") return null;
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, "\n", "￼");
  const match = /(?:^|\s)\/([^\s/]*)$/.exec(textBefore);
  if (!match) return null;
  const query = match[1];
  const to = $from.pos;
  const from = to - query.length - 1; // include the leading "/"
  const coords = view.coordsAtPos(from);
  return { from, to, query, left: coords.left, top: coords.bottom };
}

const SlashMenu = ({
  items,
  active,
  left,
  top,
  onPick,
}: {
  items: SlashCommand[];
  active: number;
  left: number;
  top: number;
  onPick: (item: SlashCommand) => void;
}) => (
  <div
    className="fixed z-50 max-h-72 w-60 overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg"
    style={{ left, top: top + 4 }}
    // Keep the editor selection intact when clicking a command.
    onMouseDown={(e) => e.preventDefault()}
  >
    {items.map((item, i) => (
      <button
        key={item.title}
        type="button"
        data-active={i === active}
        onClick={() => onPick(item)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-sm transition-colors",
          i === active ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-accent/50",
        )}
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded border border-border bg-background">
          {item.icon}
        </span>
        <span className="flex-1 truncate">{item.title}</span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">{item.hint}</span>
      </button>
    ))}
  </div>
);

export const WysiwygEditor = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (raw: string) => void;
}) => {
  // Captured once at mount: the verbatim frontmatter prefix (re-prepended on
  // every change) and the initial body markdown fed into the editor.
  const initial = useRef(splitFrontmatter(value));
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [slash, setSlash] = useState<SlashState | null>(null);
  const [active, setActive] = useState(0);

  const items = useMemo(() => {
    if (!slash) return [] as SlashCommand[];
    const q = slash.query.toLowerCase();
    if (!q) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter((c) => (c.title + " " + c.keywords).toLowerCase().includes(q));
  }, [slash]);

  // Live mirror of the menu state for the ProseMirror keydown handler, which is
  // bound once at editor construction and can't close over React state.
  const menuRef = useRef<{ open: boolean; items: SlashCommand[]; active: number; pick: (i: SlashCommand) => void; close: () => void }>({
    open: false,
    items: [],
    active: 0,
    pick: () => {},
    close: () => {},
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: "Write… “/” for blocks, or markdown shortcuts (# , - , > , ```)" }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      // html:false keeps raw HTML as literal text (preserved, never dropped);
      // breaks:false = standard markdown paragraph handling.
      Markdown.configure({ html: false, tightLists: true, linkify: false, breaks: false, transformPastedText: true, transformCopiedText: true }),
    ],
    content: initial.current.body,
    editorProps: {
      attributes: { class: "wiki-prose mx-auto w-full max-w-[710px] min-h-full py-10 focus:outline-none" },
      handleKeyDown: (_view, event) => {
        const menu = menuRef.current;
        if (!menu.open || menu.items.length === 0) {
          if (event.key === "Escape" && menu.open) {
            menu.close();
            return true;
          }
          return false;
        }
        if (event.key === "ArrowDown") {
          setActive((a) => (a + 1) % menu.items.length);
          return true;
        }
        if (event.key === "ArrowUp") {
          setActive((a) => (a - 1 + menu.items.length) % menu.items.length);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          menu.pick(menu.items[Math.min(menu.active, menu.items.length - 1)]);
          return true;
        }
        if (event.key === "Escape") {
          menu.close();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const md = (editor.storage as { markdown?: { getMarkdown: () => string } }).markdown?.getMarkdown() ?? "";
      onChangeRef.current(initial.current.fm + normalizeSerialized(md));
      setSlash(readSlash(editor));
    },
    onSelectionUpdate: ({ editor }) => setSlash(readSlash(editor)),
  });

  // Reset the highlight to the top whenever the filtered set changes.
  useEffect(() => setActive(0), [slash?.query]);

  const pick = useCallback(
    (item: SlashCommand) => {
      if (!editor || !slash) return;
      editor.chain().focus().deleteRange({ from: slash.from, to: slash.to }).run();
      item.run(editor);
      setSlash(null);
    },
    [editor, slash],
  );

  // Keep the keydown mirror current every render.
  menuRef.current = { open: !!slash && items.length > 0, items, active, pick, close: () => setSlash(null) };

  const focusEditor = useCallback(() => editor?.chain().focus().run(), [editor]);

  if (!editor) return null;

  return (
    <div className="flex h-full flex-col">
      <Toolbar editor={editor} />
      <div className="min-h-0 flex-1 overflow-auto px-6" onClick={focusEditor}>
        <EditorContent editor={editor} />
      </div>
      {slash && items.length > 0 && (
        <SlashMenu items={items} active={Math.min(active, items.length - 1)} left={slash.left} top={slash.top} onPick={pick} />
      )}
    </div>
  );
};
