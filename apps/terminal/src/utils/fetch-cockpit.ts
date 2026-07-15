// Fetches the session cockpit (review-cockpit doc parsed by the server) for a
// given cwd. Returns { found: false } on any error/empty so the caller can
// simply render nothing — the panel is best-effort, never blocks the terminal.

export interface CockpitProgressItem {
  done: boolean;
  text: string;
  anchor: string | null;
}

export interface CockpitLink {
  label: string;
  target: string | null;
}

export interface CockpitData {
  found: boolean;
  path?: string;
  title?: string | null;
  status?: string | null;
  updated?: string | null;
  progress?: CockpitProgressItem[];
  working?: CockpitLink[];
  context?: string[];
}

const COCKPIT_ENDPOINT = "/api/cockpit";

export const fetchCockpit = async (
  cwd: string | null | undefined,
  sid?: string | null,
  signal?: AbortSignal,
): Promise<CockpitData> => {
  if (!cwd) return { found: false };
  try {
    const url = new URL(COCKPIT_ENDPOINT, window.location.href);
    url.searchParams.set("cwd", cwd);
    // The session id lets the server scope the cockpit to THIS session: only a
    // doc modified during the session's lifetime is "tied" to it, so a fresh
    // terminal never inherits a previous session's cockpit doc.
    if (sid) url.searchParams.set("sid", sid);
    const response = await fetch(url.toString(), { signal });
    if (!response.ok) return { found: false };
    return (await response.json()) as CockpitData;
  } catch {
    return { found: false };
  }
};
