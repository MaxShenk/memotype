import { CHUNKING, DEFAULT_PRACTICE, STANDARD, WEIGHTED, type PracticePrefs } from "./flash";

const KEY = "memotype.practice";

type Store = { global: PracticePrefs; decks: Record<string, PracticePrefs>; places: Record<string, number> };

function normalize(value: Partial<PracticePrefs> | undefined, fallback: PracticePrefs): PracticePrefs {
  const mode = value?.mode === STANDARD || value?.mode === CHUNKING || value?.mode === WEIGHTED ? value.mode : fallback.mode;
  const size = Number(value?.chunkSize);
  return {
    mode,
    chunkSize: Number.isFinite(size) && size >= 1 ? Math.floor(size) : fallback.chunkSize,
    shuffle: typeof value?.shuffle === "boolean" ? value.shuffle : fallback.shuffle,
    startWithTerm: typeof value?.startWithTerm === "boolean" ? value.startWithTerm : fallback.startWithTerm,
  };
}

function empty(): Store {
  return { global: { ...DEFAULT_PRACTICE }, decks: {}, places: {} };
}

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<Store>;
    const decks: Record<string, PracticePrefs> = {};
    for (const [id, prefs] of Object.entries(parsed.decks ?? {})) decks[id] = normalize(prefs, DEFAULT_PRACTICE);
    const places: Record<string, number> = {};
    for (const [id, card] of Object.entries(parsed.places ?? {})) {
      const number = Number(card);
      if (Number.isInteger(number) && number >= 1) places[id] = number;
    }
    return { global: normalize(parsed.global, DEFAULT_PRACTICE), decks, places };
  } catch {
    return empty();
  }
}

function write(store: Store): void {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function loadGlobalPractice(): PracticePrefs {
  return read().global;
}

export function loadPractice(deckId: string): { prefs: PracticePrefs; custom: boolean } {
  const store = read();
  const custom = store.decks[deckId];
  if (custom) return { prefs: custom, custom: true };
  return { prefs: store.global, custom: false };
}

export function saveGlobalPractice(prefs: PracticePrefs): void {
  const store = read();
  store.global = normalize(prefs, DEFAULT_PRACTICE);
  write(store);
}

export function saveDeckPractice(deckId: string, prefs: PracticePrefs): void {
  const store = read();
  store.decks[deckId] = normalize(prefs, DEFAULT_PRACTICE);
  write(store);
}

export function clearDeckPractice(deckId: string): void {
  const store = read();
  delete store.decks[deckId];
  write(store);
}

export function loadPlace(deckId: string): number | null {
  return read().places[deckId] ?? null;
}

export function savePlace(deckId: string, card: number): void {
  if (!Number.isInteger(card) || card < 1) return;
  const store = read();
  store.places[deckId] = card;
  write(store);
}

export function clearPlace(deckId: string): void {
  const store = read();
  delete store.places[deckId];
  write(store);
}
