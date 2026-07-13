import { useCallback, useEffect, useRef, useState } from "react";
import type { Terminal as XtermTerminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import { SettingsMenu } from "@/components/settings-menu";
import { useTerminalSettings } from "@/hooks/use-terminal-settings";
import { fetchDaemonConfig } from "@/utils/fetch-daemon-config";
import { updateDaemonConfig } from "@/utils/update-daemon-config";
import { fetchServerHealth } from "@/utils/fetch-server-health";
import { connectCdp } from "@/utils/connect-cdp";
import { openInspectPage } from "@/utils/open-inspect-page";
import { useUpdateStatus } from "@/hooks/use-update-status";
import type { LocalEcho } from "@/lib/local-echo";

// The Settings activity-bar tab: the same settings surface as the terminal's
// gear, rendered inline in the detail pane. It drives `useTerminalSettings`
// with no live terminal (null refs, terminalReady=false) — the hook still owns
// localStorage + the daemon (themes/fonts) and the cross-tab `storage`
// subscription, so a change here propagates live to every open terminal tab
// without a terminal of its own. Daemon-global values (CDP port/status, grace,
// detected shell) are fetched on mount, matching what the terminal gear does
// when it opens. Session-specific info (the "Shell" section) is omitted.
export const SettingsPanel = () => {
  const terminalRef = useRef<XtermTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const localEchoRef = useRef<LocalEcho | null>(null);

  const {
    activeThemeId,
    activeFontId,
    activeNerdFontEnabled,
    activeLigaturesEnabled,
    activeFontSize,
    activeLineHeight,
    activeCursorStyle,
    activeCursorBlink,
    activeLocalEcho,
    activeScrollback,
    activeScrollOnUserInput,
    activePaddingX,
    activePaddingY,
    activeDefaultCwd,
    activeDefaultShell,
    activeCustomFontFamily,
    activeCustomThemes,
    setPreviewThemeId,
    setPreviewFontId,
    setPreviewCursorStyle,
    handleThemeChange,
    handleFontChange,
    handleNerdFontEnabledChange,
    handleLigaturesEnabledChange,
    handleFontSizeChange,
    handleLineHeightChange,
    handleCursorStyleChange,
    handleCursorBlinkChange,
    handleLocalEchoChange,
    handleScrollbackChange,
    handleScrollOnUserInputChange,
    handlePaddingXChange,
    handlePaddingYChange,
    handleDefaultCwdChange,
    handleDefaultShellChange,
    handleCustomFontFamilyChange,
    handleImportTheme,
    handleDeleteCustomTheme,
  } = useTerminalSettings({ terminalRef, fitAddonRef, terminalReady: false, localEchoRef });

  const [cdpPort, setCdpPort] = useState<number | null>(null);
  const [graceSeconds, setGraceSeconds] = useState<number | null>(null);
  const [detectedDefaultShell, setDetectedDefaultShell] = useState<string>("");
  const [cdpConnecting, setCdpConnecting] = useState(false);
  const [cdpStatus, setCdpStatus] = useState<{
    connected: boolean;
    browser?: string;
    error?: string;
  } | null>(null);
  const [notificationsPermission, setNotificationsPermission] = useState<
    NotificationPermission | "unsupported"
  >("Notification" in window ? Notification.permission : "unsupported");

  const { updateAvailable, latest: latestUpdateVersion } = useUpdateStatus();

  const refreshCdpStatus = useCallback(() => {
    void fetchServerHealth().then((health) => {
      if (health) setCdpStatus(health.cdp);
    });
  }, []);

  // Hydrate the daemon-global fields on mount (the terminal gear does this when
  // the modal opens); the appearance prefs come from useTerminalSettings.
  useEffect(() => {
    void fetchDaemonConfig().then((config) => {
      if (config) {
        setCdpPort(config.cdpPort);
        setGraceSeconds(config.graceSeconds);
        setDetectedDefaultShell(config.defaultShell);
      }
    });
    refreshCdpStatus();
  }, [refreshCdpStatus]);

  const handleCdpPortChange = useCallback((next: number | null) => {
    setCdpPort(next);
    void updateDaemonConfig({ cdpPort: next }).then((confirmed) => {
      if (confirmed) setCdpPort(confirmed.cdpPort);
    });
  }, []);

  const handleGraceSecondsChange = useCallback((next: number | null) => {
    setGraceSeconds(next);
    void updateDaemonConfig({ graceSeconds: next }).then((confirmed) => {
      if (confirmed) setGraceSeconds(confirmed.graceSeconds);
    });
  }, []);

  const handleCdpConnect = useCallback(() => {
    setCdpConnecting(true);
    void connectCdp().then((result) => {
      setCdpConnecting(false);
      if (result) {
        setCdpStatus({
          connected: result.connected,
          browser: result.browser,
          error: result.error,
        });
      } else {
        refreshCdpStatus();
      }
    });
  }, [refreshCdpStatus]);

  const handleOpenInspect = useCallback(() => {
    void openInspectPage();
  }, []);

  const handleNotificationsPermissionRequest = useCallback(() => {
    if (!("Notification" in window)) return;
    void Notification.requestPermission().then((result) => {
      setNotificationsPermission(result);
    });
  }, []);

  return (
    <SettingsMenu
      inline
      themeId={activeThemeId}
      onThemeChange={handleThemeChange}
      onThemePreview={setPreviewThemeId}
      customThemes={activeCustomThemes}
      onImportTheme={handleImportTheme}
      onDeleteTheme={handleDeleteCustomTheme}
      fontId={activeFontId}
      onFontChange={handleFontChange}
      onFontPreview={setPreviewFontId}
      customFontFamily={activeCustomFontFamily}
      onCustomFontFamilyChange={handleCustomFontFamilyChange}
      nerdFontEnabled={activeNerdFontEnabled}
      onNerdFontEnabledChange={handleNerdFontEnabledChange}
      ligaturesEnabled={activeLigaturesEnabled}
      onLigaturesEnabledChange={handleLigaturesEnabledChange}
      fontSize={activeFontSize}
      onFontSizeChange={handleFontSizeChange}
      lineHeight={activeLineHeight}
      onLineHeightChange={handleLineHeightChange}
      cursorStyle={activeCursorStyle}
      onCursorStyleChange={handleCursorStyleChange}
      onCursorStylePreview={setPreviewCursorStyle}
      cursorBlink={activeCursorBlink}
      onCursorBlinkChange={handleCursorBlinkChange}
      localEcho={activeLocalEcho}
      onLocalEchoChange={handleLocalEchoChange}
      scrollback={activeScrollback}
      onScrollbackChange={handleScrollbackChange}
      scrollOnUserInput={activeScrollOnUserInput}
      onScrollOnUserInputChange={handleScrollOnUserInputChange}
      cdpPort={cdpPort}
      cdpStatus={cdpStatus}
      cdpConnecting={cdpConnecting}
      onCdpPortChange={handleCdpPortChange}
      onCdpConnect={handleCdpConnect}
      onOpenInspect={handleOpenInspect}
      graceSeconds={graceSeconds}
      onGraceSecondsChange={handleGraceSecondsChange}
      paddingX={activePaddingX}
      onPaddingXChange={handlePaddingXChange}
      paddingY={activePaddingY}
      onPaddingYChange={handlePaddingYChange}
      defaultCwd={activeDefaultCwd}
      onDefaultCwdChange={handleDefaultCwdChange}
      defaultShell={activeDefaultShell}
      onDefaultShellChange={handleDefaultShellChange}
      detectedDefaultShell={detectedDefaultShell}
      notificationsPermission={notificationsPermission}
      onNotificationsPermissionRequest={handleNotificationsPermissionRequest}
      updateAvailable={updateAvailable}
      latestVersion={latestUpdateVersion}
    />
  );
};
