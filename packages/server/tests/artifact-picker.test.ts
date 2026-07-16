import { describe, expect, it } from "vite-plus/test";
import { ARTIFACT_PICKER_JS, injectArtifactChrome } from "../src/artifact-picker.js";

describe("injectArtifactChrome", () => {
  it("injects a <base> after <head> and the inline picker before </body>", () => {
    const out = injectArtifactChrome(
      "<html><head><title>x</title></head><body><h1>Hi</h1></body></html>",
      { baseHref: "https://deploy.example.com/app/" },
    );
    expect(out).toContain('<base href="https://deploy.example.com/app/">');
    // base sits right after the opening <head>
    expect(out.indexOf("<base")).toBeLessThan(out.indexOf("<title>"));
    // picker is inlined (not a src reference the <base> could rewrite) and lands
    // before the closing body tag
    expect(out).toContain("<script data-termdeck-picker>");
    expect(out).toContain("__termdeckPicker");
    expect(out.indexOf("data-termdeck-picker")).toBeLessThan(out.indexOf("</body>"));
  });

  it("strips a Content-Security-Policy <meta> so the inline picker can run", () => {
    const out = injectArtifactChrome(
      `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'"></head><body></body></html>`,
    );
    expect(out.toLowerCase()).not.toContain("content-security-policy");
    expect(out).toContain("data-termdeck-picker");
  });

  it("still appends the picker when the document has no <body> tag", () => {
    const out = injectArtifactChrome("<div>fragment</div>");
    expect(out).toContain("<script data-termdeck-picker>");
    expect(out.startsWith("<div>fragment</div>")).toBe(true);
  });

  it("emits exactly one </script> — the one closing the injected block", () => {
    // A stray </script> inside the inlined source would terminate the block
    // early; the injector escapes them, so only the closer remains.
    const out = injectArtifactChrome("<body></body>");
    const matches = out.match(/<\/script>/gi) ?? [];
    expect(matches.length).toBe(1);
  });

  it("the picker source is self-guarding against double injection", () => {
    expect(ARTIFACT_PICKER_JS).toContain("if (window.__termdeckPicker) return;");
  });
});
