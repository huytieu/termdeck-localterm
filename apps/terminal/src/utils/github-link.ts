// github.com/<owner>/<repo>/(issues|pull)/<n>, tolerating a trailing slash,
// query, or #anchor. Kept in sync with the server copy in
// packages/server/src/github-issue.ts.
const GITHUB_ISSUE_OR_PR_RE =
  /^https?:\/\/github\.com\/[^/\s]+\/[^/\s]+\/(?:issues|pull)\/\d+(?:[/?#].*)?$/i;

// True for a GitHub issue or pull-request URL — the links we open in the
// artifact drawer instead of a new browser tab.
export const isGithubIssueOrPrUrl = (url: string): boolean =>
  GITHUB_ISSUE_OR_PR_RE.test(url.trim());

// The artifact drawer keys off the raw github URL as its `path`; this detects
// that so WikiDetail fetches /api/github instead of treating it as a file.
export const isGithubArtifactPath = isGithubIssueOrPrUrl;

// A synthetic `.md` filename for a github URL so the wiki markdown pipeline
// (which keys rendering off the extension) treats the fetched issue as markdown
// and the drawer header shows a readable name (e.g. `termdeck-localterm-pr-42.md`).
export const githubVirtualName = (url: string): string => {
  const match = /github\.com\/[^/]+\/([^/]+)\/(issues|pull)\/(\d+)/i.exec(url);
  if (!match) return "github.md";
  return `${match[1]}-${match[2].toLowerCase() === "pull" ? "pr" : "issue"}-${match[3]}.md`;
};
