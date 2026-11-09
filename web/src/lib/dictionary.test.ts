// Vitest runs in Node. The app tsconfig has no Node types.
// @ts-expect-error node:fs is provided by the test runner.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BANDS,
  THE_ZIPF,
  deckName,
  drawLexemes,
  formatOccurrences,
  formatShare,
  inBand,
  lexemeCard,
  parseLexicon,
  perMillionFromZipf,
  perMillionToSlider,
  sliderToPerMillion,
} from "./dictionary";

describe("frequency labels", () => {
  it("turns Zipf scores into a share of English", () => {
    expect(formatShare(perMillionFromZipf(THE_ZIPF))).toBe("5.37%");
    expect(formatShare(20)).toBe("0.002%");
    expect(formatShare(perMillionFromZipf(3.4))).toBe("0.000251%");
    expect(formatOccurrences(perMillionFromZipf(THE_ZIPF))).toBe("about 53,703 times per million words");
    expect(formatOccurrences(perMillionFromZipf(3.4))).toBe("about 2.5 times per million words");
  });
});

describe("dictionary draw", () => {
  const items = parseLexicon([
    ["time", "n", "An occasion.", 6.29],
    ["mammoth", "n", "An extinct elephant.", 3.4],
    ["aardvark", "n", "A burrowing mammal.", 2.39],
    ["serendipity", "n", "Fortunate discovery.", 2.74],
  ]);

  it("keeps words inside the chosen band", () => {
    const uncommon = BANDS.find((band) => band.id === "uncommon");
    expect(uncommon).toBeTruthy();
    const words = inBand(items, uncommon!.floor, uncommon!.ceiling).map((item) => item.word);
    expect(words).toEqual(["mammoth"]);
  });

  it("draws a random subset and sorts it", () => {
    let cursor = 0;
    const sequence = [0.9, 0.1, 0.4];
    const drawn = drawLexemes(items, 2, () => sequence[cursor++] ?? 0);
    expect(drawn.map((item) => item.word)).toEqual(["mammoth", "serendipity"]);
    expect(lexemeCard(drawn[0]).term).toBe("mammoth");
    expect(lexemeCard(drawn[0]).definition).toBe("noun. An extinct elephant.");
  });

  it("round-trips the frequency slider", () => {
    const value = sliderToPerMillion(perMillionToSlider(20, 0.1, 2000), 0.1, 2000);
    expect(value).toBeGreaterThan(18);
    expect(value).toBeLessThan(22);
    expect(deckName(2, 20)).toBe("English · 0.0002% to 0.002%");
  });
});

describe("bundled lexicon", () => {
  const items = parseLexicon(JSON.parse(readFileSync(new URL("../../public/lexicon.json", import.meta.url), "utf8")));

  it("includes defined words and leaves function words out", () => {
    const byWord = new Map(items.map((item) => [item.word, item]));
    expect(byWord.has("the")).toBe(false);
    const mammoth = byWord.get("mammoth");
    expect(mammoth?.gloss).toMatch(/extinct elephants/i);
    expect(mammoth!.perMillion).toBeGreaterThan(2);
    expect(mammoth!.perMillion).toBeLessThan(3);
    expect(byWord.get("time")!.perMillion).toBeGreaterThan(1000);
    const uncommon = BANDS.find((band) => band.id === "uncommon")!;
    expect(inBand(items, uncommon.floor, uncommon.ceiling).length).toBeGreaterThan(1000);
    const rare = BANDS.find((band) => band.id === "rare")!;
    const rareWords = new Set(inBand(items, rare.floor, rare.ceiling).map((item) => item.word));
    expect(rareWords.size).toBeGreaterThan(500);
    expect(rareWords.has("pulchritude")).toBe(true);
    expect(rareWords.has("sesquipedalian")).toBe(true);
    expect(rareWords.has("defenestration")).toBe(true);
    expect(byWord.has("drainpipe")).toBe(false);
    expect(byWord.has("undergarment")).toBe(false);
  });
});
