import { describe, expect, it } from "vite-plus/test";
import { analyzeToken } from "../../src/utils/file-link-provider";

const pathOf = (token: string) => analyzeToken(token)?.match.path ?? null;

describe("analyzeToken", () => {
  it("matches absolute, home, and dot-relative paths", () => {
    expect(pathOf("/etc/hosts")).toBe("/etc/hosts");
    expect(pathOf("/tmp")).toBe("/tmp");
    expect(pathOf("~/Downloads")).toBe("~/Downloads");
    expect(pathOf("./scripts/run.sh")).toBe("./scripts/run.sh");
    expect(pathOf("../lib/util.py")).toBe("../lib/util.py");
  });

  it("matches bare relative paths only when the last segment has an extension", () => {
    expect(pathOf("04-projects/notes/plan.md")).toBe("04-projects/notes/plan.md");
    expect(pathOf("src/components/terminal.tsx")).toBe("src/components/terminal.tsx");
    expect(pathOf("and/or")).toBeNull();
    expect(pathOf("07/13")).toBeNull();
    expect(pathOf("50/52")).toBeNull();
  });

  it("parses :line and :line:col suffixes", () => {
    expect(analyzeToken("src/index.ts:42")?.match).toEqual({
      path: "src/index.ts",
      line: 42,
      column: null,
    });
    expect(analyzeToken("src/index.ts:42:7")?.match).toEqual({
      path: "src/index.ts",
      line: 42,
      column: 7,
    });
  });

  it("only matches slash-less tokens with both an extension and a line suffix", () => {
    expect(analyzeToken("index.ts:42")?.match.path).toBe("index.ts");
    expect(pathOf("index.ts")).toBeNull();
    expect(pathOf("v2.58.0")).toBeNull();
    expect(pathOf("Node.js")).toBeNull();
    expect(pathOf("e.g.")).toBeNull();
  });

  it("strips wrapping quotes, brackets, and trailing prose punctuation", () => {
    expect(pathOf('"04-projects/plan.md"')).toBe("04-projects/plan.md");
    expect(pathOf("`src/app.tsx`")).toBe("src/app.tsx");
    expect(pathOf("(lib/bar.py)")).toBe("lib/bar.py");
    expect(pathOf("src/foo.ts.")).toBe("src/foo.ts");
    expect(pathOf("path/file.md:")).toBe("path/file.md");
  });

  it("reports the linkified span offset within the token", () => {
    const analysis = analyzeToken('("src/foo.ts:3")');
    expect(analysis?.start).toBe(2);
    expect(analysis?.length).toBe("src/foo.ts:3".length);
  });

  it("never matches URLs or scheme-ish tokens", () => {
    expect(pathOf("https://github.com/foo/bar.md")).toBeNull();
    expect(pathOf("file:///etc/hosts")).toBeNull();
    expect(pathOf("http://x.dev/a/b.ts:1")).toBeNull();
  });

  it("ignores noise tokens", () => {
    expect(pathOf("/")).toBeNull();
    expect(pathOf("~/")).toBeNull();
    expect(pathOf("--flag")).toBeNull();
    expect(pathOf("a/b")).toBeNull();
  });
});
