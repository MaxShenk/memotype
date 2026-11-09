/** English dictionary decks. Frequencies are wordfreq Zipf scores. */

import { type Card } from "./flash";

export type Lexeme = {
  word: string;
  pos: string;
  gloss: string;
  perMillion: number;
};

/** Zipf score of "the" in wordfreq's English list. It is not a dictionary headword. */
export const THE_ZIPF = 7.73;

export const BANDS = [
  { id: "common", label: "Common", floor: 100, ceiling: 2000 },
  { id: "familiar", label: "Familiar", floor: 10, ceiling: 100 },
  { id: "uncommon", label: "Uncommon", floor: 1, ceiling: 10 },
  // Zipf 1.0–1.8: about once every 15–100 million words. The old rare band
  // bottomed out around "drainpipe", which is infrequent but obvious.
  { id: "rare", label: "Rare", floor: 0.01, ceiling: 0.08 },
] as const;

const POS_LABEL: Record<string, string> = {
  n: "noun",
  v: "verb",
  a: "adjective",
  s: "adjective",
  r: "adverb",
};

export function perMillionFromZipf(zipf: number): number {
  return 10 ** (zipf - 3);
}

export function formatShare(perMillion: number): string {
  return `${significant(perMillion / 10_000, 3)}%`;
}

export function formatOccurrences(perMillion: number): string {
  if (perMillion >= 10) {
    return `about ${Math.round(perMillion).toLocaleString("en-US")} times per million words`;
  }
  if (perMillion >= 1) {
    const rounded = Math.round(perMillion * 10) / 10;
    if (rounded === 1) return "about once per million words";
    return `about ${rounded.toLocaleString("en-US")} times per million words`;
  }
  const every = 1 / perMillion;
  const rounded = every >= 10 ? Math.round(every).toLocaleString("en-US") : String(Math.round(every * 10) / 10);
  return `about once every ${rounded} million words`;
}

export function deckName(floor: number, ceiling: number): string {
  const low = Math.min(floor, ceiling);
  const high = Math.max(floor, ceiling);
  return `English · ${formatShare(low)} to ${formatShare(high)}`;
}

export function parseLexicon(raw: unknown): Lexeme[] {
  if (!Array.isArray(raw)) throw new Error("Dictionary data is unreadable.");
  const items: Lexeme[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 4) continue;
    const [word, pos, gloss, zipf] = row;
    if (typeof word !== "string" || typeof pos !== "string" || typeof gloss !== "string" || typeof zipf !== "number") continue;
    if (!word || !gloss || !Number.isFinite(zipf)) continue;
    items.push({ word, pos, gloss, perMillion: perMillionFromZipf(zipf) });
  }
  if (items.length === 0) throw new Error("Dictionary data is empty.");
  return items;
}

let loading: Promise<Lexeme[]> | null = null;

export function loadLexicon(): Promise<Lexeme[]> {
  loading ??= fetch("/lexicon.json?v=2")
    .then(async (response) => {
      if (!response.ok) throw new Error("The dictionary could not be loaded.");
      return parseLexicon(await response.json());
    })
    .catch((error: unknown) => {
      loading = null;
      throw error;
    });
  return loading;
}

export function frequencyExtent(items: Lexeme[]): { min: number; max: number } {
  let min = Infinity;
  let max = 0;
  for (const item of items) {
    min = Math.min(min, item.perMillion);
    max = Math.max(max, item.perMillion);
  }
  return { min, max };
}

export function sliderToPerMillion(position: number, min: number, max: number): number {
  const logMin = Math.log10(min);
  const logMax = Math.log10(max);
  const clamped = Math.min(1000, Math.max(0, position));
  return 10 ** (logMin + (clamped / 1000) * (logMax - logMin));
}

export function perMillionToSlider(value: number, min: number, max: number): number {
  const logMin = Math.log10(min);
  const logMax = Math.log10(max);
  const clamped = Math.min(max, Math.max(min, value));
  if (logMax === logMin) return 0;
  return Math.round(((Math.log10(clamped) - logMin) / (logMax - logMin)) * 1000);
}

export function inBand(items: Lexeme[], floor: number, ceiling: number): Lexeme[] {
  const low = Math.min(floor, ceiling) / 1.03;
  const high = Math.max(floor, ceiling) * 1.03;
  return items.filter((item) => item.perMillion >= low && item.perMillion <= high);
}

export function drawLexemes(items: Lexeme[], count: number, random: () => number = Math.random): Lexeme[] {
  const copy = items.slice();
  const take = Math.max(0, Math.min(copy.length, Math.floor(count)));
  for (let index = 0; index < take; index += 1) {
    const swap = index + Math.floor(random() * (copy.length - index));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy.slice(0, take).sort((a, b) => a.word.localeCompare(b.word));
}

export function lexemeCard(item: Lexeme): Card {
  const label = POS_LABEL[item.pos] ?? "word";
  return { term: item.word, definition: `${label}. ${item.gloss}`, image: "", enabled: true };
}

export function nearestLexeme(items: Lexeme[], perMillion: number): Lexeme | null {
  let best: Lexeme | null = null;
  let bestDistance = Infinity;
  for (const item of items) {
    const distance = Math.abs(Math.log(item.perMillion) - Math.log(perMillion));
    if (distance < bestDistance) {
      best = item;
      bestDistance = distance;
    }
  }
  return best;
}

function significant(value: number, figures: number): string {
  if (!Number.isFinite(value) || value === 0) return "0";
  const digits = Math.max(0, figures - 1 - Math.floor(Math.log10(Math.abs(value))));
  return value.toFixed(digits).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}
