import { useEffect, useState, useSyncExternalStore } from "react";
import { Tldraw, type Editor, type TLUiAssetUrlOverrides } from "tldraw";
import { getAssetUrlsByImport } from "@tldraw/assets/imports.vite";
import { currentTheme, subscribeTheme } from "@/lib/theme";
import { MarkdownCardShapeUtil } from "@/components/canvas/markdown-shape";
import { MermaidShapeUtil } from "@/components/canvas/mermaid-shape";
import { registerCanvasPasteHandlers } from "@/components/canvas/paste";
import "tldraw/tldraw.css";

// Custom shapes: pasted mermaid renders as a live diagram, pasted markdown as
// a rendered card (see canvas/paste.ts for the detection rules). Must be a
// stable module-level array — a new identity per render resets the editor.
const shapeUtils = [MermaidShapeUtil, MarkdownCardShapeUtil];

// tldraw loads its fonts/icons/translations from cdn.tldraw.com by default.
// Bundling them via @tldraw/assets keeps the canvas fully offline — same
// local-first stance as the rest of TermDeck (nothing leaves the machine).
const assetUrls: TLUiAssetUrlOverrides = getAssetUrlsByImport();

// TermDeck canvas mode: an infinite tldraw whiteboard. persistenceKey stores
// the whole document in IndexedDB and live-syncs it across same-origin tabs,
// so the board survives reloads and works with no server or account.
const PERSISTENCE_KEY = "termdeck-canvas";

// tldraw's SDK wants a license key in production (a free hobby license covers
// personal tools — apply at tldraw.dev/#pricing). Stored in localStorage so a
// key can be added later without a rebuild:
//   localStorage.setItem("termdeck:tldrawLicense", "<key>")
const licenseKey = window.localStorage.getItem("termdeck:tldrawLicense") ?? undefined;

export const Canvas = () => {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => "dark" as const);
  const [editor, setEditor] = useState<Editor | null>(null);

  // Follow the shared ty-theme cookie rather than tldraw's own system
  // inference, so the canvas flips together with the terminal / wiki chrome.
  useEffect(() => {
    editor?.user.updateUserPreferences({ colorScheme: theme });
  }, [editor, theme]);

  return (
    <div className="relative h-full w-full">
      <Tldraw
        persistenceKey={PERSISTENCE_KEY}
        assetUrls={assetUrls}
        licenseKey={licenseKey}
        shapeUtils={shapeUtils}
        onMount={(e) => {
          setEditor(e);
          registerCanvasPasteHandlers(e);
        }}
      />
    </div>
  );
};
