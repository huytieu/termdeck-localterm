import { BookText, SquareTerminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { switchMode, type ShellMode } from "@/hooks/use-shell";

const Item = ({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    aria-current={active ? "page" : undefined}
    title={label}
    className={cn(
      "relative flex h-12 w-full items-center justify-center text-muted-foreground transition-colors hover:text-foreground",
      active && "text-foreground",
    )}
  >
    {active && <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-foreground" />}
    {icon}
  </button>
);

// Leftmost rail — the mode switch (Terminal / Wiki), VS Code activity-bar style.
export const ActivityBar = ({ mode }: { mode: ShellMode }) => (
  <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-background py-2">
    <span className="mb-1 font-mono text-[10px] font-bold tracking-tight text-muted-foreground">TD</span>
    <Item
      active={mode === "term"}
      label="Terminals"
      icon={<SquareTerminal className="size-5" />}
      onClick={() => switchMode("term")}
    />
    <Item
      active={mode === "wiki"}
      label="Wiki"
      icon={<BookText className="size-5" />}
      onClick={() => switchMode("wiki")}
    />
  </nav>
);
