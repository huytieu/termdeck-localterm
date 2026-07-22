import { useCallback, useEffect, useRef, useState } from "react";
import type { Terminal as XtermTerminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import type { WebglAddon } from "@xterm/addon-webgl";
import { SettingsMenu } from "@/components/settings-menu";
import { useDaemonSettings } from "@/hooks/use-daemon-settings";
import { useTerminalSettings } from "@/hooks/use-terminal-settings";
import { useUpdateStatus } from "@/hooks/use-update-status";
import type { LocalEcho } from "@/lib/local-echo";

// The Settings activity-bar tab: the same settings surface as the terminal's
// gear, rendered inline in the detail pane. It drives `useTerminalSettings`
// with no live terminal (null refs, terminalReady=false) — the hook still owns
// localStorage + the daemon (themes/fonts) and the cross-tab `storage`
// subscription, so a change here propagates live to every open terminal tab
// without a terminal of its own. Daemon-global values (CDP port/status, grace,
// workspace restore, detected shell) come from `useDaemonSettings`, hydrated on
// mount — matching what the terminal gear does when it opens. Session-specific
// info (the "Shell" section) is omitted.
export const SettingsPanel = () => {
  const terminalRef = useRef<XtermTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const webglAddonRef = useRef<WebglAddon | null>(null);
  const localEchoRef = useRef<LocalEcho | null>(null);

  const {
    activeThemeId,
    activeFontId,
    activeNerdFontEnabled,
    activeLigaturesEnabled,
    activeMuteEmojiColors,
    activeWebglEnabled,
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
    activeMobileResume,
    activeCustomFontFamily,
    activeCustomThemes,
    setPreviewThemeId,
    setPreviewFontId,
    setPreviewCursorStyle,
    handleThemeChange,
    handleFontChange,
    handleNerdFontEnabledChange,
    handleLigaturesEnabledChange,
    handleMuteEmojiColorsChange,
    handleWebglEnabledChange,
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
    handleMobileResumeChange,
    handleCustomFontFamilyChange,
    handleImportTheme,
    handleDeleteCustomTheme,
  } = useTerminalSettings({
    terminalRef,
    fitAddonRef,
    webglAddonRef,
    terminalReady: false,
    localEchoRef,
  });

  const {
    cdpPort,
    graceSeconds,
    workspaceRestore,
    detectedDefaultShell,
    cdpStatus,
    cdpConnecting,
    handleCdpPortChange,
    handleGraceSecondsChange,
    handleWorkspaceRestoreChange,
    handleCdpConnect,
    handleOpenInspect,
    loadDaemonSettings,
  } = useDaemonSettings();

  const [notificationsPermission, setNotificationsPermission] = useState<
    NotificationPermission | "unsupported"
  >("Notification" in window ? Notification.permission : "unsupported");

  const { updateAvailable, latest: latestUpdateVersion } = useUpdateStatus();

  // Hydrate the daemon-global fields on mount (the terminal gear does this when
  // the modal opens); the appearance prefs come from useTerminalSettings.
  useEffect(() => {
    loadDaemonSettings();
  }, [loadDaemonSettings]);

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
      muteEmojiColors={activeMuteEmojiColors}
      onMuteEmojiColorsChange={handleMuteEmojiColorsChange}
      webglEnabled={activeWebglEnabled}
      onWebglEnabledChange={handleWebglEnabledChange}
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
      workspaceRestore={workspaceRestore}
      onWorkspaceRestoreChange={handleWorkspaceRestoreChange}
      paddingX={activePaddingX}
      onPaddingXChange={handlePaddingXChange}
      paddingY={activePaddingY}
      onPaddingYChange={handlePaddingYChange}
      defaultCwd={activeDefaultCwd}
      onDefaultCwdChange={handleDefaultCwdChange}
      defaultShell={activeDefaultShell}
      onDefaultShellChange={handleDefaultShellChange}
      detectedDefaultShell={detectedDefaultShell}
      mobileResume={activeMobileResume}
      onMobileResumeChange={handleMobileResumeChange}
      notificationsPermission={notificationsPermission}
      onNotificationsPermissionRequest={handleNotificationsPermissionRequest}
      updateAvailable={updateAvailable}
      latestVersion={latestUpdateVersion}
    />
  );
};
