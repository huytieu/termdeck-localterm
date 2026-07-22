import { ClipboardAddon } from "@xterm/addon-clipboard";
import { FitAddon } from "@xterm/addon-fit";
import { ImageAddon } from "@xterm/addon-image";
import { ProgressAddon } from "@xterm/addon-progress";
import { SearchAddon } from "@xterm/addon-search";
import { UnicodeGraphemesAddon } from "@xterm/addon-unicode-graphemes";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal as XtermTerminal } from "@xterm/xterm";
import type { IUnicodeVersionProvider } from "@xterm/xterm";

import {
  LOCALTERM_MOUSE_CELLS_PROPERTY,
  LOCALTERM_PANE_TEXT_PROPERTY,
} from "@monotykamary/localterm-server/protocol";

import { XTERM_DEFAULT_SCROLL_SENSITIVITY } from "@/lib/constants";
import type { TerminalFont } from "@/lib/terminal-fonts";
import { familyForFont } from "@/lib/terminal-fonts";
import type { TerminalTheme } from "@/lib/terminal-themes";
import { generateExtendedPalette } from "@/utils/generate-extended-palette";
import { getTerminalMinimumContrastRatio } from "@/utils/get-terminal-minimum-contrast-ratio";
import { preserveTerminalMouseWheelMagnitude } from "@/utils/preserve-terminal-mouse-wheel-magnitude";
import { EmojiWidthUnicodeProvider } from "@/utils/emoji-width-unicode-provider";
import { outputBatcher } from "@/utils/write-terminal-output";

interface CurrentRef<Value> {
  current: Value;
}

interface TerminalSearchResultState {
  resultIndex: number;
  resultCount: number;
}

interface CreateTerminalSurfaceOptions {
  container: HTMLDivElement;
  initialCursorBlink: boolean;
  initialCursorStyle: "block" | "underline" | "bar";
  initialFont: TerminalFont;
  initialFontSize: number;
  initialLineHeight: number;
  initialMuteEmojiColors: boolean;
  initialNerdFontEnabled: boolean;
  initialScrollback: number;
  initialScrollOnUserInput: boolean;
  initialTheme: TerminalTheme;
  fitAddonRef: CurrentRef<FitAddon | null>;
  searchAddonRef: CurrentRef<SearchAddon | null>;
  webglAddonRef: CurrentRef<WebglAddon | null>;
  setSearchResults: (value: TerminalSearchResultState) => void;
  // Custom URL-click handler for WebLinksAddon (e.g. route deploy links and
  // GitHub issue/PR URLs into the artifact drawer). Default opens a new tab.
  openLink?: (uri: string) => void;
}

interface TerminalSurface {
  terminal: XtermTerminal;
  fitAddon: FitAddon;
  loadWebgl: () => void;
  // Enable (WebGL) or disable (fall back to xterm's built-in DOM renderer) GPU
  // rendering live, without recreating the terminal or reconnecting the PTY.
  // The escape hatch for the HiDPI-scroll glyph-atlas corruption in the
  // backported device-resolution renderer patch.
  setWebglEnabled: (enabled: boolean) => void;
  dispose: () => void;
}

export const createTerminalSurface = ({
  container,
  initialCursorBlink,
  initialCursorStyle,
  initialFont,
  initialFontSize,
  initialLineHeight,
  initialMuteEmojiColors,
  initialNerdFontEnabled,
  initialScrollback,
  initialScrollOnUserInput,
  initialTheme,
  fitAddonRef,
  searchAddonRef,
  webglAddonRef,
  setSearchResults,
  openLink,
}: CreateTerminalSurfaceOptions): TerminalSurface => {
  const terminal = new XtermTerminal({
    allowProposedApi: true,
    cursorBlink: initialCursorBlink,
    cursorStyle: initialCursorStyle,
    fontFamily: familyForFont(initialFont, initialNerdFontEnabled),
    fontSize: initialFontSize,
    lineHeight: initialLineHeight,
    minimumContrastRatio: getTerminalMinimumContrastRatio(initialTheme),
    scrollback: initialScrollback,
    scrollSensitivity: XTERM_DEFAULT_SCROLL_SENSITIVITY,
    theme: {
      ...initialTheme.colors,
      extendedAnsi: generateExtendedPalette(initialTheme.colors),
    },
    vtExtensions: { kittyKeyboard: true },
    macOptionIsMeta: true,
    scrollOnUserInput: initialScrollOnUserInput,
    windowOptions: {
      getWinSizePixels: true,
      getCellSizePixels: true,
      getWinSizeChars: true,
    },
    scrollbar: { showScrollbar: false },
  });
  outputBatcher.attach(terminal);
  const fitAddon = new FitAddon();
  fitAddonRef.current = fitAddon;
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(openLink ? new WebLinksAddon((_event, uri) => openLink(uri)) : new WebLinksAddon());
  terminal.loadAddon(new ClipboardAddon());
  terminal.loadAddon(new ImageAddon());
  terminal.loadAddon(new ProgressAddon());
  terminal.loadAddon(new UnicodeGraphemesAddon());
  const graphemesProvider = (
    terminal as unknown as {
      _core: { unicodeService: { _activeProvider: IUnicodeVersionProvider } };
    }
  )._core.unicodeService._activeProvider;
  terminal.unicode.register(
    new EmojiWidthUnicodeProvider(
      graphemesProvider,
      // The spacing-combining-mark override only matches Claude Code, which
      // runs in the normal buffer. Full-screen TUIs (vim, less, tmux) run in
      // the alternate buffer and use correct combining-mark widths.
      () => terminal.buffer.active.type === "normal",
    ),
  );
  terminal.unicode.activeVersion = "15-graphemes-emoji";
  const searchAddon = new SearchAddon();
  terminal.loadAddon(searchAddon);
  searchAddonRef.current = searchAddon;
  const searchResultsDisposable = searchAddon.onDidChangeResults(setSearchResults);

  terminal.open(container);
  const mouseWheelMagnitudeDisposable = preserveTerminalMouseWheelMagnitude(terminal);

  // Expose viewport serializers to the daemon's CDP automation (capture-pane
  // --png, mouse). The daemon reads these off the tab's window over the
  // existing CDP socket: a pane-text serializer (the render-landed source of
  // truth — a content-equality check against the server-side capture renderer
  // that can't return stale pixels) and a cell-metrics helper (col/row →
  // pixel for Input.dispatchMouseEvent). Mirrors LOCALTERM_TAB_TOKEN_PROPERTY
  // — well-known names so the wire protocol stays authoritative. Torn down
  // on unmount so a tab the user closed never answers a stale query.
  const windowProperties = window as unknown as Record<string, unknown>;
  windowProperties[LOCALTERM_PANE_TEXT_PROPERTY] = (): string => {
    const buffer = terminal.buffer.active;
    const rows: string[] = [];
    for (let rowIndex = buffer.baseY; rowIndex < buffer.baseY + terminal.rows; rowIndex += 1) {
      const line = buffer.getLine(rowIndex);
      rows.push(line ? line.translateToString(true) : "");
    }
    while (rows.length > 0 && rows[rows.length - 1] === "") rows.pop();
    return rows.join("\n");
  };
  windowProperties[LOCALTERM_MOUSE_CELLS_PROPERTY] = () => {
    const screen = container.querySelector(".xterm-screen");
    if (!(screen instanceof HTMLElement)) return null;
    const rectangle = screen.getBoundingClientRect();
    return {
      left: rectangle.left,
      top: rectangle.top,
      cellWidth: terminal.cols > 0 ? rectangle.width / terminal.cols : 0,
      cellHeight: terminal.rows > 0 ? rectangle.height / terminal.rows : 0,
      cols: terminal.cols,
      rows: terminal.rows,
    };
  };

  // Idempotent: a no-op when the WebGL renderer is already loaded so the
  // enable-on-toggle path can't stack a second addon on the same terminal.
  const enableWebgl = () => {
    if (webglAddonRef.current) return;
    try {
      const webglAddon = new WebglAddon({
        muteEmojiColors: initialMuteEmojiColors,
      });
      webglAddon.onContextLoss(() => {
        if (webglAddonRef.current === webglAddon) webglAddonRef.current = null;
        outputBatcher.setInteractiveRenderingEnabled(false);
        webglAddon.dispose();
      });
      terminal.loadAddon(webglAddon);
      webglAddonRef.current = webglAddon;
      outputBatcher.setInteractiveRenderingEnabled(true);
    } catch {
      /* webgl unavailable; xterm falls back to dom renderer */
    }
  };

  return {
    terminal,
    fitAddon,
    loadWebgl: enableWebgl,
    setWebglEnabled: (enabled: boolean) => {
      if (enabled) {
        enableWebgl();
        return;
      }
      const webglAddon = webglAddonRef.current;
      if (!webglAddon) return;
      // Disposing the WebGL addon restores xterm's built-in DOM renderer. Turn
      // off the synchronous interactive-render fast path (it only exists to pace
      // WebGL frames) and force a full repaint so the freshly restored DOM
      // renderer paints the current viewport instead of an emptied canvas.
      outputBatcher.setInteractiveRenderingEnabled(false);
      webglAddonRef.current = null;
      webglAddon.dispose();
      terminal.refresh(0, terminal.rows - 1);
    },
    dispose: () => {
      searchResultsDisposable.dispose();
      mouseWheelMagnitudeDisposable?.dispose();
      delete windowProperties[LOCALTERM_PANE_TEXT_PROPERTY];
      delete windowProperties[LOCALTERM_MOUSE_CELLS_PROPERTY];
      outputBatcher.detach();
      webglAddonRef.current = null;
      terminal.dispose();
    },
  };
};
