import capitals from "../../../assets/decks/country-capitals.json";
import { normalizePassage } from "./engine";
import { type Card, assertUniqueCards, cardKey, parseDeck } from "./flash";
import { BUILTIN_DECK_ID, type DeckRow, type ScoreRow, type SourceRow, sanitizeName } from "./model";

const KEY = "memotype.local.v1";

type StoredCard = Card & { deck_id: string; position: number; card_key: string };
type StoredStat = { deck_id: string; card_key: string; e: number; c: number; ls: number };
type Store = {
  sources: SourceRow[];
  scores: ScoreRow[];
  decks: DeckRow[];
  cards: StoredCard[];
  stats: StoredStat[];
};

const CAPITALS = capitals as { term: string; definition: string }[];

function empty(): Store {
  return { sources: [], scores: [], decks: [], cards: [], stats: [] };
}

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<Store>;
    return { ...empty(), ...parsed };
  } catch {
    return empty();
  }
}

function write(store: Store): void {
  localStorage.setItem(KEY, JSON.stringify(store));
}

function id(): string {
  return crypto.randomUUID();
}

export function localListSources(): SourceRow[] {
  return read().sources.slice().sort((a, b) => a.name.localeCompare(b.name));
}

export function localEnsureSample(): void {
  const store = read();
  if (store.sources.length > 0) return;
  store.sources.push({
    id: id(),
    name: "Getting Started",
    body: `Memory grows when you reach for a line before you look at it.

Read the passage once, then type the words you still hold. Each correct word is a light left on. If a word is gone, reveal it, then type it anyway. The fingers learn what the mind is still borrowing.`,
    updated_at: new Date().toISOString(),
  });
  write(store);
}

export function localSaveSource(input: { id?: string; name: string; body: string }): void {
  const name = sanitizeName(input.name);
  const body = normalizePassage(input.body);
  if (!body) throw new Error("Paste a passage first.");
  const store = read();
  if (store.sources.some((row) => row.name.toLowerCase() === name.toLowerCase() && row.id !== input.id)) {
    throw new Error("A source with that name already exists.");
  }
  if (input.id) {
    const row = store.sources.find((item) => item.id === input.id);
    if (!row) throw new Error("That source is gone.");
    row.name = name;
    row.body = body;
    row.updated_at = new Date().toISOString();
  } else {
    store.sources.push({ id: id(), name, body, updated_at: new Date().toISOString() });
  }
  write(store);
}

export function localDeleteSource(sourceId: string): void {
  const store = read();
  store.sources = store.sources.filter((row) => row.id !== sourceId);
  store.scores = store.scores.filter((row) => row.source_id !== sourceId);
  write(store);
}

export function localListScores(sourceId: string): ScoreRow[] {
  return read()
    .scores.filter((row) => row.source_id === sourceId)
    .sort((a, b) => b.score - a.score || b.wpm - a.wpm || a.seconds - b.seconds)
    .slice(0, 100);
}

export function localRecordScore(entry: Omit<ScoreRow, "id" | "created_at">): number | null {
  const store = read();
  const row: ScoreRow = { ...entry, id: id(), created_at: new Date().toISOString() };
  store.scores.push(row);
  write(store);
  const rows = localListScores(entry.source_id);
  const rank = rows.findIndex((item) => item.id === row.id) + 1;
  return rank > 0 && rank <= 100 ? rank : null;
}

export function localListDecks(): DeckRow[] {
  const builtin: DeckRow = {
    id: BUILTIN_DECK_ID,
    name: "Country capitals",
    builtin_key: "country-capitals",
    user_id: null,
  };
  const mine = read().decks.slice().sort((a, b) => a.name.localeCompare(b.name));
  return [builtin, ...mine];
}

export function localImportDeck(name: string, raw: unknown): { id: string; updated: boolean } {
  const cards = parseDeck(raw);
  const store = read();
  const clean = sanitizeName(name);
  const existing = store.decks.find((row) => row.name.toLowerCase() === clean.toLowerCase());
  if (existing) {
    replaceStoredCards(store, existing.id, cards);
    write(store);
    return { id: existing.id, updated: true };
  }
  const deckId = id();
  store.decks.push({ id: deckId, name: clean, builtin_key: null, user_id: "local" });
  cards.forEach((card, position) => {
    store.cards.push({ ...card, deck_id: deckId, position, card_key: cardKey(card) });
  });
  write(store);
  return { id: deckId, updated: false };
}

export function localSaveDeck(deckId: string, name: string, cards: Card[]): void {
  if (deckId === BUILTIN_DECK_ID) throw new Error("Built-in decks stay as they are.");
  if (cards.length === 0) throw new Error("A deck needs at least one card.");
  assertUniqueCards(cards);
  const store = read();
  const deck = store.decks.find((row) => row.id === deckId);
  if (!deck) throw new Error("That deck is gone.");
  const clean = sanitizeName(name);
  if (store.decks.some((row) => row.id !== deckId && row.name.toLowerCase() === clean.toLowerCase())) {
    throw new Error("A deck with that name already exists.");
  }
  deck.name = clean;
  replaceStoredCards(store, deckId, cards);
  write(store);
}

export function localReplaceCards(deckId: string, raw: unknown): void {
  if (deckId === BUILTIN_DECK_ID) throw new Error("Built-in decks stay as they are.");
  const cards = parseDeck(raw);
  const store = read();
  if (!store.decks.some((row) => row.id === deckId)) throw new Error("That deck is gone.");
  replaceStoredCards(store, deckId, cards);
  write(store);
}

function replaceStoredCards(store: Store, deckId: string, cards: Card[]): void {
  store.cards = store.cards.filter((row) => row.deck_id !== deckId);
  cards.forEach((card, position) => {
    store.cards.push({ ...card, deck_id: deckId, position, card_key: cardKey(card) });
  });
}

export function localDeleteDeck(deckId: string): void {
  if (deckId === BUILTIN_DECK_ID) throw new Error("The built-in deck stays.");
  const store = read();
  store.decks = store.decks.filter((row) => row.id !== deckId);
  store.cards = store.cards.filter((row) => row.deck_id !== deckId);
  store.stats = store.stats.filter((row) => row.deck_id !== deckId);
  write(store);
}

export function localLoadCards(deckId: string): Card[] {
  if (deckId === BUILTIN_DECK_ID) {
    return CAPITALS.map((card) => ({ term: card.term, definition: card.definition, image: "" }));
  }
  return read()
    .cards.filter((row) => row.deck_id === deckId)
    .sort((a, b) => a.position - b.position)
    .map((row) => ({ term: row.term, definition: row.definition, image: row.image, enabled: row.enabled !== false }));
}

export function localLoadStats(deckId: string): Map<string, { e: number; c: number; ls: number }> {
  const map = new Map<string, { e: number; c: number; ls: number }>();
  for (const row of read().stats) {
    if (row.deck_id === deckId) map.set(row.card_key, { e: row.e, c: row.c, ls: row.ls });
  }
  return map;
}

export function localSaveStat(deckId: string, key: string, stats: { e: number; c: number; ls: number }): void {
  const store = read();
  const existing = store.stats.find((row) => row.deck_id === deckId && row.card_key === key);
  if (existing) {
    existing.e = stats.e;
    existing.c = stats.c;
    existing.ls = stats.ls;
  } else {
    store.stats.push({ deck_id: deckId, card_key: key, e: stats.e, c: stats.c, ls: stats.ls });
  }
  write(store);
}

export function localResetStats(deckId: string): void {
  const store = read();
  store.stats = store.stats.filter((row) => row.deck_id !== deckId);
  write(store);
}
