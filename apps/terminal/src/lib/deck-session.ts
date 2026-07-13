// Minimal shape of the session objects returned by GET /api/sessions. Kept
// local (rather than reusing TerminalSessionInfo, which is the WS-connect
// payload) because the REST list is the grid's only data source and carries
// exactly these fields.
export interface DeckSession {
  id: string;
  pid: number;
  shellName: string;
  cwd: string;
  title: string;
  createdAt: number;
  lastOutputAt: number;
  clients: number;
  state: string;
  pinned: boolean;
}

interface SessionsResponse {
  sessions: DeckSession[];
}

export const fetchSessions = async (signal?: AbortSignal): Promise<DeckSession[]> => {
  const response = await fetch("/api/sessions", { signal });
  if (!response.ok) throw new Error(`sessions: ${response.status}`);
  const body = (await response.json()) as SessionsResponse;
  return body.sessions ?? [];
};

// Last N rendered lines of a session's screen (plain text, no ANSI) — the tile
// snapshot source. capturePane is the server's flushed source of truth.
export const fetchPane = async (id: string, lines: number, signal?: AbortSignal): Promise<string> => {
  const response = await fetch(`/api/sessions/${encodeURIComponent(id)}/pane?lines=${lines}`, {
    signal,
  });
  if (!response.ok) throw new Error(`pane: ${response.status}`);
  const body = (await response.json()) as { text: string };
  return body.text ?? "";
};

// Spawn a new detached (pinned) session. Returns its id so the caller can drill
// straight into it. cwd omitted -> the daemon's default working directory.
export const createSession = async (): Promise<string> => {
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!response.ok) throw new Error(`create: ${response.status}`);
  const body = (await response.json()) as { session?: DeckSession };
  const id = body.session?.id;
  if (!id) throw new Error("create: no session id");
  return id;
};

// Kill (close) a session by id — the grid's tile close/right-click action.
export const killSession = async (id: string): Promise<void> => {
  await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
};

// Shorten an absolute cwd for tile display: collapse $HOME to ~ and keep the
// last two path segments so long vault paths stay legible.
export const shortenCwd = (cwd: string): string => {
  const home = "/Users/";
  let display = cwd;
  const userMatch = cwd.match(/^\/Users\/[^/]+(\/.*)?$/);
  if (userMatch) display = `~${userMatch[1] ?? ""}`;
  else if (!cwd.startsWith(home)) display = cwd;
  const parts = display.split("/").filter(Boolean);
  if (parts.length <= 2) return display;
  return `…/${parts.slice(-2).join("/")}`;
};
