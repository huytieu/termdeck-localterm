import { isGithubIssueOrPrUrl } from "@/utils/github-link";

// A plain http(s) URL (not a vault path). Used to route deploy links into the
// artifact drawer as a live preview instead of opening a new browser tab.
export const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value.trim());

// A URL we render as a framed preview in the artifact drawer: any http(s) URL
// EXCEPT a GitHub issue/PR (those already open as fetched markdown, not a frame).
export const isPreviewableUrl = (value: string): boolean =>
  isHttpUrl(value) && !isGithubIssueOrPrUrl(value);

// The same-origin proxy URL the drawer's iframe loads for a remote deploy, so
// the element picker can be injected and postMessage back to the shell.
export const proxyUrlFor = (url: string): string =>
  `/api/artifact/proxy?url=${encodeURIComponent(url.trim())}`;

// A short human label for a remote URL shown in the drawer header — host plus a
// trimmed path so `https://product.withkatalon.com/watu/overview` reads as
// `product.withkatalon.com/watu/overview`.
export const remoteHostLabel = (url: string): string => {
  try {
    const u = new URL(url);
    const tail = `${u.hostname}${u.pathname}`.replace(/\/$/, "");
    return tail.length > 60 ? `${tail.slice(0, 57)}…` : tail;
  } catch {
    return url;
  }
};
