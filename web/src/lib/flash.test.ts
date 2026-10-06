import { describe, expect, it } from "vitest";
import {
  CHUNKING,
  type Card,
  STANDARD,
  DeckParseError,
  MemoryProgress,
  type Rng,
  Session,
  WEIGHTED,
  cardKey,
  hardestRows,
  normalizeAnswer,
  parseDeck,
} from "./flash";

const cards: Card[] = [
  { term: "France", definition: "Paris", image: "" },
  { term: "Spain", definition: "Madrid", image: "" },
  { term: "", definition: "Heron", image: "data:image/png;base64,YQ==" },
];

describe("normalizeAnswer", () => {
  it("strips accents and space", () => {
    expect(normalizeAnswer("  José  ")).toBe("jose");
    expect(normalizeAnswer("josé")).toBe(normalizeAnswer("Jose"));
    expect(normalizeAnswer("   ")).toBe("");
  });
});

describe("parseDeck", () => {
  it("rejects a bad file", () => {
    expect(() => parseDeck({ term: "A" })).toThrow(DeckParseError);
    expect(() => parseDeck([])).toThrow(/empty array/);
    expect(() => parseDeck([{ term: "A", definition: "  " }])).toThrow(/definition/);
    expect(() => parseDeck([{ term: "", definition: "Paris" }])).toThrow(/term/);
    expect(() => parseDeck([{ term: "A", definition: "B", image: "dot.png" }])).toThrow(/https/);
    expect(parseDeck([{ term: "A", definition: "B", enabled: false }])[0].enabled).toBe(false);
  });
});

describe("session", () => {
  it("asks for the definition on a picture-only card", () => {
    const session = new Session("deck", cards, new MemoryProgress("deck"));
    session.setStartWithTerm(false);
    session.order = [2, 0, 1];
    session.cursor = 0;
    expect(session.showingTerm()).toBe(true);
    expect(session.expectedText()).toBe("Heron");
    expect(session.promptImage()).toBe("data:image/png;base64,YQ==");
  });

  it("requires the expected text after a miss and keeps lifetime stats", () => {
    const progress = new MemoryProgress("deck");
    const session = new Session("deck", cards, progress);
    expect(session.check("paris", 10)).toBe("correct");
    expect(session.advance("")).toBe("advanced");
    expect(session.check("nope", 11)).toBe("wrong");
    expect(session.sessionMistakes).toBe(1);
    expect(session.advance("nope")).toBe("need-correction");
    expect(session.advance("Madrid")).toBe("advanced");
    expect(progress.get("deck", cardKey(cards[1])).e).toBe(1);
    session.restart();
    expect(session.sessionMistakes).toBe(0);
    expect(progress.totals()).toEqual([1, 1]);
  });

  it("stays in a chunk until every card is mastered", () => {
    const session = new Session("deck", cards, new MemoryProgress("deck"));
    session.chunkSize = 2;
    session.setMode(CHUNKING);
    expect(session.currentIndex()).toBe(0);
    session.check("Paris", 1);
    session.advance("");
    expect(session.currentIndex()).toBe(1);
    session.check("wrong", 2);
    session.advance("Madrid");
    expect(session.currentIndex()).toBe(1);
    expect(session.mastered.has(1)).toBe(false);
    session.check("Madrid", 3);
    session.advance("");
    expect(session.chunkStart).toBe(2);
    expect(session.currentIndex()).toBe(2);
  });

  it("does not repeat the current weighted card", () => {
    const progress = new MemoryProgress("deck");
    const rng: Rng = {
      shuffle() {
        return undefined;
      },
      choices(population, weights) {
        let best = 0;
        for (let i = 1; i < population.length; i += 1) {
          if (weights[i] > weights[best] || (weights[i] === weights[best] && population[i] < population[best])) best = i;
        }
        return population[best];
      },
    };
    progress.record("deck", cardKey(cards[2]), false, 1);
    progress.record("deck", cardKey(cards[2]), false, 2);
    const session = new Session("deck", cards, progress, rng);
    session.setMode(WEIGHTED);
    expect(session.currentIndex()).toBe(0);
    session.checked = true;
    session.correctionRequired = false;
    session.advance("");
    expect(session.currentIndex()).toBe(2);
    const seen = [session.currentIndex()];
    for (let i = 0; i < 6; i += 1) {
      session.checked = true;
      session.correctionRequired = false;
      session.advance("");
      seen.push(session.currentIndex());
    }
    expect(seen.every((value, index) => index === 0 || value !== seen[index - 1])).toBe(true);
    const count = (n: number) => seen.filter((value) => value === n).length;
    expect(count(2)).toBeGreaterThan(count(1));
  });

  it("keeps the current card when settings change", () => {
    const session = new Session("deck", cards, new MemoryProgress("deck"));
    session.cursor = 1;
    expect(session.check("Madrid", 1)).toBe("correct");
    session.setShuffle(true);
    expect(session.currentIndex()).toBe(1);
    expect(session.checked).toBe(true);
    session.setMode(CHUNKING);
    expect(session.currentIndex()).toBe(1);
    session.setChunkSize(1);
    expect(session.currentIndex()).toBe(1);
    session.setStartWithTerm(false);
    expect(session.currentIndex()).toBe(1);
    expect(session.checked).toBe(false);
    expect(session.sessionMistakes).toBe(0);
    session.setShuffle(false);
    expect(session.currentIndex()).toBe(1);
    session.setMode(STANDARD);
    expect(session.currentIndex()).toBe(1);
    expect(session.cursor).toBe(1);
  });

  it("skips a turned-off card and jumps by deck number", () => {
    const deck: Card[] = [
      { term: "A", definition: "1", image: "", enabled: true },
      { term: "B", definition: "2", image: "", enabled: false },
      { term: "C", definition: "3", image: "", enabled: true },
    ];
    const session = new Session("deck", deck, new MemoryProgress("deck"));
    expect(session.order).toEqual([0, 2]);
    expect(session.positionLabel()).toBe("1 / 3");
    expect(session.jumpTo(2)).toBe("off");
    expect(session.currentIndex()).toBe(0);
    expect(session.jumpTo(3)).toBe("ok");
    expect(session.currentIndex()).toBe(2);
    expect(session.positionLabel()).toBe("3 / 3");
    expect(session.jumpTo(4)).toBe("missing");
    session.check("3", 1);
    session.advance("");
    expect(session.currentIndex()).toBe(0);
  });

  it("draws only cards that are turned on", () => {
    const deck: Card[] = [
      { term: "A", definition: "1", image: "", enabled: false },
      { term: "B", definition: "2", image: "", enabled: true },
    ];
    const rng: Rng = { shuffle() {}, choices: (population) => population[0] };
    const session = new Session("deck", deck, new MemoryProgress("deck"), rng);
    session.setMode(WEIGHTED);
    expect(session.currentIndex()).toBe(1);
    session.check("2", 1);
    session.advance("");
    expect(session.currentIndex()).toBe(1);
  });

  it("sorts the hardest cards by weight, then errors", () => {
    const progress = new MemoryProgress("deck");
    progress.record("deck", cardKey(cards[0]), true, 1);
    progress.record("deck", cardKey(cards[1]), false, 2);
    progress.record("deck", cardKey(cards[1]), false, 3);
    const rows = hardestRows(cards, progress, "deck");
    expect(rows[0].term).toBe("Spain");
    expect(rows[1].term).toBe("France");
    expect(rows).toHaveLength(2);
  });
});
