import { beforeEach, describe, expect, it } from "vitest";
import { CHUNKING, STANDARD } from "./flash";
import { clearDeckPractice, clearPlace, loadPlace, loadPractice, saveDeckPractice, saveGlobalPractice, savePlace } from "./prefs";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    },
  });
});

describe("practice prefs", () => {
  it("uses the global default until a deck overrides it", () => {
    expect(loadPractice("deck-a")).toEqual({
      prefs: { mode: CHUNKING, chunkSize: 10, shuffle: true, startWithTerm: true },
      custom: false,
    });
    saveGlobalPractice({ mode: STANDARD, chunkSize: 5, shuffle: false, startWithTerm: false });
    expect(loadPractice("deck-a").prefs.mode).toBe(STANDARD);
    saveDeckPractice("deck-a", { mode: CHUNKING, chunkSize: 3, shuffle: true, startWithTerm: true });
    expect(loadPractice("deck-a")).toMatchObject({ custom: true, prefs: { chunkSize: 3 } });
    expect(loadPractice("deck-b").prefs.mode).toBe(STANDARD);
    clearDeckPractice("deck-a");
    expect(loadPractice("deck-a").custom).toBe(false);
    expect(loadPractice("deck-a").prefs.chunkSize).toBe(5);
    savePlace("deck-a", 15);
    expect(loadPlace("deck-a")).toBe(15);
    expect(loadPractice("deck-a").prefs.mode).toBe(STANDARD);
    clearPlace("deck-a");
    expect(loadPlace("deck-a")).toBeNull();
  });
});
