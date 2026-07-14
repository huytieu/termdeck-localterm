// Wiki reading-mode preferences: two persisted booleans that gate chrome
// visibility across components (the toggle lives in wiki-detail.tsx, the
// gating lives in shell.tsx), so state has to be an external store rather than
// component-local `useState` — modeled on `lib/theme.ts`. `createBooleanStoredSetting`
// (src/utils/create-stored-setting.ts) handles the localStorage read/write and
// the native cross-tab `storage` event; that event only fires in OTHER tabs, so
// we notify an in-memory listener Set synchronously on every set/toggle for
// same-tab reactivity, exactly like the theme store.
//
// This is a global wiki-view preference — NOT per-file, NOT URL-encoded.

import { createBooleanStoredSetting } from "@/utils/create-stored-setting";

const readingModeSetting = createBooleanStoredSetting("termdeck:wikiReadingMode", false);
const infoPanelSetting = createBooleanStoredSetting("termdeck:wikiInfoPanel", true);

const readingModeListeners = new Set<() => void>();
const infoPanelListeners = new Set<() => void>();

export function readingMode(): boolean {
  return readingModeSetting.load();
}

export function setReadingMode(value: boolean): void {
  readingModeSetting.store(value);
  readingModeListeners.forEach((l) => l());
}

export function toggleReadingMode(): void {
  setReadingMode(!readingMode());
}

export function subscribeReadingMode(listener: () => void): () => void {
  readingModeListeners.add(listener);
  const unsubscribeStorage = readingModeSetting.subscribe(() => listener());
  return () => {
    readingModeListeners.delete(listener);
    unsubscribeStorage();
  };
}

export function infoPanelOpen(): boolean {
  return infoPanelSetting.load();
}

export function setInfoPanelOpen(value: boolean): void {
  infoPanelSetting.store(value);
  infoPanelListeners.forEach((l) => l());
}

export function toggleInfoPanelOpen(): void {
  setInfoPanelOpen(!infoPanelOpen());
}

export function subscribeInfoPanel(listener: () => void): () => void {
  infoPanelListeners.add(listener);
  const unsubscribeStorage = infoPanelSetting.subscribe(() => listener());
  return () => {
    infoPanelListeners.delete(listener);
    unsubscribeStorage();
  };
}
