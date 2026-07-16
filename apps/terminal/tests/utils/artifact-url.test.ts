import { describe, expect, it } from "vite-plus/test";
import {
  isHttpUrl,
  isPreviewableUrl,
  proxyUrlFor,
  remoteHostLabel,
} from "../../src/utils/artifact-url";

describe("artifact-url", () => {
  it("recognises http(s) URLs and rejects paths", () => {
    expect(isHttpUrl("https://product.withkatalon.com/watu")).toBe(true);
    expect(isHttpUrl("http://localhost:3000")).toBe(true);
    expect(isHttpUrl("/vault/report.html")).toBe(false);
    expect(isHttpUrl("~/notes/plan.md")).toBe(false);
  });

  it("treats deploy links as previewable but not GitHub issues/PRs", () => {
    expect(isPreviewableUrl("https://huytieu.com/blog/x")).toBe(true);
    expect(isPreviewableUrl("https://github.com/huytieu/repo/pull/42")).toBe(false);
    expect(isPreviewableUrl("https://github.com/huytieu/repo/issues/7")).toBe(false);
    // a plain github repo/file URL isn't an issue/PR, so it previews as a page
    expect(isPreviewableUrl("https://github.com/huytieu/repo")).toBe(true);
  });

  it("builds an encoded same-origin proxy URL", () => {
    expect(proxyUrlFor("https://example.com/a?b=c")).toBe(
      "/api/artifact/proxy?url=https%3A%2F%2Fexample.com%2Fa%3Fb%3Dc",
    );
  });

  it("labels a remote URL as host + trimmed path", () => {
    expect(remoteHostLabel("https://product.withkatalon.com/watu/overview")).toBe(
      "product.withkatalon.com/watu/overview",
    );
    expect(remoteHostLabel("https://example.com/")).toBe("example.com");
    expect(remoteHostLabel("not a url")).toBe("not a url");
  });
});
