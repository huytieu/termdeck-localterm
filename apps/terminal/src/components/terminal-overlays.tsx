import { lazy, Suspense, useEffect, useState, type ComponentProps } from "react";
// A modal that renders markdown (react-markdown + shiki). Lazy so the shiki
// highlighter stays out of the initial terminal bundle — it loads the first
// time the user actually opens the modal, then stays resident.
const AutomationsModal = lazy(() =>
  import("@/components/automations-modal").then((m) => ({ default: m.AutomationsModal })),
);
import { CommandPalette } from "@/components/command-palette";
import { DiffViewer } from "@/components/diff-viewer";
import { KeyboardShortcutsModal } from "@/components/keyboard-shortcuts-modal";
import { PortsModal } from "@/components/ports-modal";
import { QrModal } from "@/components/qr-modal";
import { SecretsModal } from "@/components/secrets-modal";
import { SessionsModal } from "@/components/sessions-modal";
import { WorktreesModal } from "@/components/worktrees-modal";

interface TerminalOverlaysProps {
  commandPalette: ComponentProps<typeof CommandPalette>;
  diffViewer: ComponentProps<typeof DiffViewer>;
  keyboardShortcutsModal: ComponentProps<typeof KeyboardShortcutsModal>;
  automationsModal: ComponentProps<typeof AutomationsModal>;
  worktreesModal: ComponentProps<typeof WorktreesModal>;
  sessionsModal: ComponentProps<typeof SessionsModal>;
  portsModal: ComponentProps<typeof PortsModal>;
  secretsModal: ComponentProps<typeof SecretsModal>;
  qrModal: ComponentProps<typeof QrModal>;
}

export const TerminalOverlays = ({
  commandPalette,
  diffViewer,
  keyboardShortcutsModal,
  automationsModal,
  worktreesModal,
  sessionsModal,
  portsModal,
  secretsModal,
  qrModal,
}: TerminalOverlaysProps) => {
  // Latch: never mount the lazy modal until its first open (keeps the shiki
  // chunk out of startup); once opened it stays mounted so its close animation
  // still runs and the chunk stays resident.
  const [automationsEverOpened, setAutomationsEverOpened] = useState(false);
  useEffect(() => {
    if (automationsModal.open) setAutomationsEverOpened(true);
  }, [automationsModal.open]);
  return (
    <>
      <CommandPalette {...commandPalette} />
      <DiffViewer {...diffViewer} />
      <KeyboardShortcutsModal {...keyboardShortcutsModal} />
      {automationsEverOpened && (
        <Suspense fallback={null}>
          <AutomationsModal {...automationsModal} />
        </Suspense>
      )}
      <WorktreesModal {...worktreesModal} />
      <SessionsModal {...sessionsModal} />
      <PortsModal {...portsModal} />
      <SecretsModal {...secretsModal} />
      <QrModal {...qrModal} />
    </>
  );
};
