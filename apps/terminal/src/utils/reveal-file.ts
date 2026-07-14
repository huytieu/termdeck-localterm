// Ask the daemon to reveal a document's real file in the OS file manager
// (Finder on macOS) — the browser can't do it, so /api/reveal runs it locally.
export const revealFileLocation = async (cwd: string, filePath: string): Promise<boolean> => {
  try {
    const url = new URL("/api/reveal", window.location.href);
    url.searchParams.set("cwd", cwd);
    url.searchParams.set("path", filePath);
    const response = await fetch(url, { method: "POST" });
    return response.ok;
  } catch {
    return false;
  }
};
