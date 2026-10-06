import { beforeEach, describe, expect, it } from "vitest";
import { localImportDeck, localListDecks, localLoadCards, localReplaceCards, localSaveDeck } from "./local";

const store = new Map<string, string>();
let sequence = 1;

beforeEach(() => {
  store.clear();
  sequence = 1;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { randomUUID: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}` },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  });
});

describe("local decks", () => {
  it("updates a deck when the same name is imported again", () => {
    const first = localImportDeck("Plants", [{ term: "Oak", definition: "Tree" }]);
    const second = localImportDeck("plants", [{ term: "Oak", definition: "A tree" }, { term: "Ivy", definition: "Vine" }]);
    expect(second.updated).toBe(true);
    expect(second.id).toBe(first.id);
    expect(localListDecks().filter((row) => row.name === "Plants")).toHaveLength(1);
    expect(localLoadCards(first.id).map((card) => card.definition)).toEqual(["A tree", "Vine"]);
  });

  it("saves edits and replaces cards from a file", () => {
    const created = localImportDeck("Plants", [{ term: "Oak", definition: "Tree" }]);
    localSaveDeck(created.id, "Trees", [{ term: "Oak", definition: "Tree", image: "" }, { term: "Pine", definition: "Tree", image: "" }]);
    expect(localListDecks().some((row) => row.name === "Trees")).toBe(true);
    localReplaceCards(created.id, [{ term: "Elm", definition: "Tree" }]);
    expect(localLoadCards(created.id).map((card) => card.term)).toEqual(["Elm"]);
  });

  it("keeps a card that is turned off", () => {
    const created = localImportDeck("Plants", [{ term: "Oak", definition: "Tree" }, { term: "Ivy", definition: "Vine" }]);
    localSaveDeck(created.id, "Plants", [
      { term: "Oak", definition: "Tree", image: "", enabled: false },
      { term: "Ivy", definition: "Vine", image: "", enabled: true },
    ]);
    expect(localLoadCards(created.id).map((card) => card.enabled)).toEqual([false, true]);
  });
});
