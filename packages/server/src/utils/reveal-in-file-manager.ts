import { spawn } from "node:child_process";
import path from "node:path";

// Reveal a file in the OS file manager so the user can see where it physically
// lives: Finder on macOS (selects the file), Explorer on Windows (selects it),
// and the containing folder on Linux (xdg-open has no cross-DE "select" verb).
// Fire-and-forget: the child is detached + unref'd so it never ties up the
// daemon. The daemon already hands out shells, so opening a file manager is not
// an escalation; the caller still resolves + stat-checks the path first.
export const revealInFileManager = (absolutePath: string): boolean => {
  try {
    if (process.platform === "darwin") {
      spawn("open", ["-R", absolutePath], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "win32") {
      spawn("explorer", [`/select,${absolutePath}`], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [path.dirname(absolutePath)], { detached: true, stdio: "ignore" }).unref();
    }
    return true;
  } catch {
    return false;
  }
};
