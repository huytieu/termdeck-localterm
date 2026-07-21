import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { App } from "../src/app";

vi.mock("../src/components/terminal", () => ({
  Terminal: () => <div data-testid="terminal" />,
}));

// The TermDeck shell renders the session Grid on a bare launch (no ?sid=) and
// mounts the Terminal only for a selected session — unlike upstream, where the
// terminal IS the app. Both paths must render without contacting the server.
describe("App", () => {
  it("renders the shell immediately without contacting the server", async () => {
    render(<App />);
    expect(await screen.findByRole("button", { name: "Terminals" })).toBeDefined();
  });

  it("mounts the terminal for a ?sid= session", async () => {
    window.history.replaceState(null, "", "/?sid=test-session");
    try {
      render(<App />);
      expect(await screen.findByTestId("terminal")).toBeDefined();
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });
});
