import { AuthGate } from "@/components/auth-gate";
import { Terminal } from "@/components/terminal";
import { Shell } from "@/components/shell";
import { isEmbedded } from "@/hooks/use-shell";

// Grid tiles load the app with ?embed=1 and render the bare terminal (no shell
// chrome); every other entry renders the full TermDeck shell.
export const App = () => <AuthGate>{isEmbedded() ? <Terminal /> : <Shell />}</AuthGate>;
