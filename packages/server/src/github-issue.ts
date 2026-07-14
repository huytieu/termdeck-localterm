import { execFile } from "node:child_process";
import fs from "node:fs";

// GitHub issue/PR pages send `x-frame-options: deny` + CSP `frame-ancestors
// 'none'`, so they can't be embedded in an iframe. Instead we fetch the issue
// through the authed `gh` CLI and render it as markdown in the artifact drawer,
// where the wiki's select-to-chat already works.

export interface GithubRef {
  owner: string;
  repo: string;
  kind: "issue" | "pr";
  number: number;
}

// Matches github.com/<owner>/<repo>/(issues|pull)/<n>, tolerating a trailing
// slash, query, or #anchor. Kept in sync with the client copy in
// apps/terminal/src/utils/github-link.ts.
const URL_RE = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/(issues|pull)\/(\d+)(?:[/?#].*)?$/i;

export const parseGithubRef = (url: string): GithubRef | null => {
  const match = URL_RE.exec(url.trim());
  if (!match) return null;
  return {
    owner: match[1],
    repo: match[2],
    kind: match[3].toLowerCase() === "pull" ? "pr" : "issue",
    number: Number(match[4]),
  };
};

// The daemon's PATH often lacks Homebrew, so probe the common install paths
// before falling back to a bare `gh` (resolved via PATH).
const resolveGhBin = (): string => {
  const candidates = [
    process.env.GH_BIN,
    "/opt/homebrew/bin/gh",
    "/usr/local/bin/gh",
    "/usr/bin/gh",
  ].filter((entry): entry is string => Boolean(entry));
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* unreadable -> next */
    }
  }
  return "gh";
};

// owner/repo/number are validated by URL_RE and passed as discrete execFile
// args (no shell), so a crafted URL can't inject a command.
const runGh = (args: string[]): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile(
      resolveGhBin(),
      args,
      { maxBuffer: 8 * 1024 * 1024, timeout: 20000 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr?.toString().trim() || err.message));
        else resolve(stdout.toString());
      },
    );
  });

interface GhActor {
  login?: string;
}
interface GhComment {
  author?: GhActor;
  body?: string;
  createdAt?: string;
}
interface GhReview {
  author?: GhActor;
  state?: string;
  body?: string;
  submittedAt?: string;
}
interface GhItem {
  title?: string;
  number?: number;
  state?: string;
  author?: GhActor;
  body?: string;
  labels?: { name?: string }[];
  url?: string;
  createdAt?: string;
  comments?: GhComment[];
  reviews?: GhReview[];
}

const day = (iso?: string): string => (iso ? iso.slice(0, 10) : "");
const login = (actor?: GhActor): string => (actor?.login ? `@${actor.login}` : "@unknown");

const renderMarkdown = (ref: GithubRef, item: GhItem): string => {
  const labels = (item.labels ?? []).map((label) => label.name).filter(Boolean);
  const out: string[] = [];
  out.push(`# ${item.title ?? "(untitled)"} #${item.number ?? ref.number}`);
  out.push(
    [
      `\`${String(item.state ?? "").toUpperCase()}\``,
      ref.kind === "pr" ? "Pull request" : "Issue",
      login(item.author),
      day(item.createdAt),
      labels.length ? `labels: ${labels.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
  );
  if (item.url) out.push("", `[View on GitHub →](${item.url})`);
  out.push("");
  out.push(item.body?.trim() ? item.body.trim() : "_No description._");

  const reviews = ref.kind === "pr" ? (item.reviews ?? []).filter((r) => r.body?.trim() || r.state) : [];
  if (reviews.length) {
    out.push("", "---", `## Reviews (${reviews.length})`);
    for (const review of reviews) {
      out.push("", `### ${login(review.author)} — ${String(review.state ?? "").replace(/_/g, " ")} · ${day(review.submittedAt)}`);
      if (review.body?.trim()) out.push("", review.body.trim());
    }
  }

  const comments = item.comments ?? [];
  out.push("", "---", `## Comments (${comments.length})`);
  if (!comments.length) out.push("", "_No comments._");
  for (const comment of comments) {
    out.push("", `### ${login(comment.author)} · ${day(comment.createdAt)}`, "", comment.body?.trim() || "_(empty)_");
  }
  return out.join("\n");
};

export interface GithubMarkdown {
  markdown: string;
  title: string;
  url: string;
}

// Fetch an issue/PR via `gh` and render it to markdown. Returns null when the
// url isn't a recognizable issue/PR; throws when `gh` fails (missing/auth/404).
export const fetchGithubMarkdown = async (url: string): Promise<GithubMarkdown | null> => {
  const ref = parseGithubRef(url);
  if (!ref) return null;
  const fields =
    ref.kind === "pr"
      ? "title,state,number,author,body,labels,url,createdAt,comments,reviews"
      : "title,state,number,author,body,labels,url,createdAt,comments";
  const raw = await runGh([
    ref.kind === "pr" ? "pr" : "issue",
    "view",
    String(ref.number),
    "--repo",
    `${ref.owner}/${ref.repo}`,
    "--json",
    fields,
  ]);
  const item = JSON.parse(raw) as GhItem;
  return {
    markdown: renderMarkdown(ref, item),
    title: item.title ?? `${ref.owner}/${ref.repo}#${ref.number}`,
    url: item.url ?? url,
  };
};
