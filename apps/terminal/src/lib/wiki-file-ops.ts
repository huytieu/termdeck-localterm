// File-manager operations for the wiki tree: create, rename, move, delete.
//
// The daemon has no dedicated create/rename/move/delete routes, and rebuilding
// it to add them would drop every live terminal session. So — exactly like the
// existing new-file flow — these run one-shot shell commands through the
// /api/exec runner. Every path is absolute and single-quote escaped; each op
// guards against clobbering an existing target so a rename/move can't silently
// overwrite a file.

export interface FileOpResult {
  ok: boolean;
  error?: string;
}

// Single-quote shell escaping: wrap in '…' and turn any embedded ' into '\''.
const shq = (s: string): string => `'${s.replace(/'/g, "'\\''")}'`;

const dirOf = (p: string): string => p.slice(0, p.lastIndexOf("/")) || "/";
const baseOf = (p: string): string => p.slice(p.lastIndexOf("/") + 1);

const run = async (command: string, cwd: string): Promise<FileOpResult> => {
  try {
    const res = await fetch("/api/exec", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ command, cwd, timeoutMs: 15000 }),
    });
    const body = (await res.json()) as {
      error?: string;
      exitCode?: number | null;
      output?: string;
    };
    if (body.error) return { ok: false, error: body.error };
    if (typeof body.exitCode === "number" && body.exitCode !== 0) {
      return { ok: false, error: (body.output ?? "").trim() || `exited ${body.exitCode}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "The daemon didn't respond." };
  }
};

// Sentinel echoed by the guards below so a refusal to clobber reads as a clear
// message instead of a bare non-zero exit.
const EXISTS = "__LT_EXISTS__";

// Create an empty file (parents made as needed). No-op if it already exists, so
// the caller can safely open it afterwards.
export const createFile = (root: string, abs: string): Promise<FileOpResult> =>
  run(`mkdir -p ${shq(dirOf(abs))} && if [ ! -e ${shq(abs)} ]; then : > ${shq(abs)}; fi`, root);

// Create a directory (parents made as needed).
export const createFolder = (root: string, abs: string): Promise<FileOpResult> =>
  run(`mkdir -p ${shq(abs)}`, root);

// Rename in place (same parent directory). Refuses if the target name is taken.
export const renamePath = async (
  root: string,
  from: string,
  toName: string,
): Promise<FileOpResult> => {
  const to = `${dirOf(from)}/${toName}`;
  if (to === from) return { ok: true };
  const result = await run(
    `if [ -e ${shq(to)} ]; then echo ${EXISTS}; exit 3; fi; mv ${shq(from)} ${shq(to)}`,
    root,
  );
  if (!result.ok && result.error?.includes(EXISTS)) {
    return { ok: false, error: `"${toName}" already exists here.` };
  }
  return result;
};

// Move an entry into a destination directory. Refuses to move a folder into
// itself/a descendant, or onto an existing same-named entry.
export const movePath = async (
  root: string,
  src: string,
  destDir: string,
): Promise<FileOpResult> => {
  if (dirOf(src) === destDir) return { ok: true }; // already there
  if (destDir === src || destDir.startsWith(`${src}/`)) {
    return { ok: false, error: "Can't move a folder into itself." };
  }
  const target = `${destDir}/${baseOf(src)}`;
  const result = await run(
    `if [ -e ${shq(target)} ]; then echo ${EXISTS}; exit 3; fi; mv ${shq(src)} ${shq(destDir)}/`,
    root,
  );
  if (!result.ok && result.error?.includes(EXISTS)) {
    return { ok: false, error: `"${baseOf(src)}" already exists in that folder.` };
  }
  return result;
};

// Delete a file or a directory (recursively for directories).
export const deletePath = (root: string, abs: string, isDirectory: boolean): Promise<FileOpResult> =>
  run(isDirectory ? `rm -rf ${shq(abs)}` : `rm -f ${shq(abs)}`, root);
