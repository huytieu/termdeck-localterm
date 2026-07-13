import { useMemo } from "react";
import { parseDelimited, delimiterFor } from "@/utils/parse-delimited";

const MAX_ROWS = 1000;

// Renders a .csv/.tsv file as a table (first row = header). Caps rows so a huge
// export can't lock the tab; a notice shows when truncated. Source toggle in the
// wiki header still shows the raw text.
export const CsvView = ({ path, content }: { path: string; content: string }) => {
  const { header, rows, truncated } = useMemo(() => {
    const all = parseDelimited(content, delimiterFor(path)).filter(
      (r) => r.length > 1 || (r[0] ?? "").length > 0,
    );
    const [head, ...body] = all;
    return {
      header: head ?? [],
      rows: body.slice(0, MAX_ROWS),
      truncated: body.length > MAX_ROWS,
    };
  }, [path, content]);

  if (header.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 font-mono text-xs text-muted-foreground/60">
        empty file
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-3">
      <table className="border-collapse font-mono text-[11px]">
        <thead className="sticky top-0 bg-background">
          <tr>
            <th className="border border-border/50 px-2 py-1 text-right text-muted-foreground/50">
              #
            </th>
            {header.map((cell, i) => (
              <th
                key={i}
                className="border border-border/50 bg-muted/30 px-2 py-1 text-left font-semibold text-foreground"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="hover:bg-accent/20">
              <td className="border border-border/40 px-2 py-1 text-right tabular-nums text-muted-foreground/40">
                {r + 1}
              </td>
              {header.map((_, c) => (
                <td key={c} className="border border-border/40 px-2 py-1 text-foreground/90">
                  {row[c] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {truncated && (
        <div className="px-2 py-3 font-mono text-[10px] text-muted-foreground/60">
          Showing the first {MAX_ROWS} rows.
        </div>
      )}
    </div>
  );
};
