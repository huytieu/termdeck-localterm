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

// Session activity → a minimal colored glyph, shared by the sidebar list and
// the grid tile headers so both speak the same status language. `running` =
// output flowing (working), `alive-quiet` = a foreground program is up but
// quiet (waiting on you — review), `ready` = back at the shell prompt (done /
// free). Solid ● = a live process; hollow ○ = idle. `color` is a Tailwind text
// class; `pulse` marks the state that should breathe.
export interface SessionStateMeta {
  glyph: string;
  color: string;
  label: string;
  pulse?: boolean;
}

const STATE_META: Record<string, SessionStateMeta> = {
  running: { glyph: "●", color: "text-amber-500", label: "Running", pulse: true },
  "alive-quiet": { glyph: "●", color: "text-[var(--primary)]", label: "Needs you" },
  ready: { glyph: "○", color: "text-emerald-500", label: "Idle · done" },
};

export const sessionStateMeta = (state: string): SessionStateMeta => STATE_META[state] ?? STATE_META.ready;

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
export const createSession = async (cwd?: string): Promise<string> => {
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cwd ? { cwd } : {}),
  });
  if (!response.ok) throw new Error(`create: ${response.status}`);
  const body = (await response.json()) as { session?: DeckSession };
  const id = body.session?.id;
  if (!id) throw new Error("create: no session id");
  return id;
};

// "Chat about this" from a wiki file: route a prompt + selection back to the
// linked session (typed into its live PTY), or spawn a fresh Claude Code session
// at the base dir with the file @-referenced. Returns where it landed + the id.
export const chatAboutSelection = async (input: {
  sessionId?: string | null;
  path: string;
  selection: string;
  prompt: string;
  line?: number | null;
  baseDir?: string | null;
}): Promise<{ delivered: "session" | "new"; id: string }> => {
  const response = await fetch("/api/wiki/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`chat: ${response.status}`);
  const body = (await response.json()) as { delivered?: "session" | "new"; id?: string };
  if (!body.id || !body.delivered) throw new Error("chat: bad response");
  return { delivered: body.delivered, id: body.id };
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
