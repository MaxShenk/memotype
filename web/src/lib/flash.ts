/** Flashcard session rules. Mirrors memotype/flashcards/session.py. */

export const STANDARD = "standard";
export const CHUNKING = "chunking";
export const WEIGHTED = "weighted";

export type Card = { term: string; definition: string; image: string; enabled?: boolean };

export function cardEnabled(card: Card): boolean {
  return card.enabled !== false;
}

export type Stats = { e: number; c: number; ls: number };

// Postgres text cannot store a NUL byte, so the stored key uses unit separator.
export const CARD_KEY_SEPARATOR = "\u001f";

export function cardKey(card: Card): string {
  return card.term + CARD_KEY_SEPARATOR + card.definition;
}

export function normalizeAnswer(text: string): string {
  const decomposed = text.normalize("NFD").replace(/\p{M}/gu, "");
  return decomposed.split(/\s+/).filter(Boolean).join(" ").toLowerCase();
}

export function cardWeight(errors: number, corrects: number): number {
  return Math.max(1, 1 + 3 * errors - Math.floor(corrects / 3));
}

export interface Progress {
  get(deckId: string, key: string): Stats;
  record(deckId: string, key: string, correct: boolean, nowMs: number): void;
}

export interface Rng {
  shuffle<T>(items: T[]): void;
  choices<T>(population: T[], weights: number[]): T;
}

export function defaultRng(): Rng {
  return {
    shuffle(items) {
      for (let i = items.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
      }
    },
    choices(population, weights) {
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      let ticket = Math.random() * total;
      for (let i = 0; i < population.length; i += 1) {
        ticket -= weights[i];
        if (ticket < 0) return population[i];
      }
      return population[population.length - 1];
    },
  };
}

export function promptIsTerm(card: Card, startWithTerm: boolean): boolean {
  if (startWithTerm) {
    if (!card.definition.trim()) return false;
    return true;
  }
  if (!card.term.trim()) return true;
  return false;
}

export type HardRow = {
  index: number;
  term: string;
  definition: string;
  e: number;
  c: number;
  accuracy: number;
  weight: number;
};

export function hardestRows(cards: Card[], progress: Progress, deckId: string, limit = 12): HardRow[] {
  const rows: HardRow[] = [];
  cards.forEach((card, index) => {
    const stats = progress.get(deckId, cardKey(card));
    const attempts = stats.e + stats.c;
    if (attempts === 0) return;
    rows.push({
      index: index + 1,
      term: card.term || "(image)",
      definition: card.definition,
      e: stats.e,
      c: stats.c,
      accuracy: stats.c / attempts,
      weight: cardWeight(stats.e, stats.c),
    });
  });
  rows.sort((a, b) => b.weight - a.weight || b.e - a.e || a.accuracy - b.accuracy);
  return rows.slice(0, limit);
}

export class DeckParseError extends Error {}

export function parseDeck(raw: unknown): Card[] {
  if (!Array.isArray(raw)) throw new DeckParseError("Cards file must export an array...");
  if (raw.length === 0) throw new DeckParseError("Cards file exported an empty array.");
  const cards = raw.map((entry, index) => parseCard(entry, index + 1));
  assertUniqueCards(cards);
  return cards;
}

export function assertUniqueCards(cards: Card[]): void {
  const seen = new Set<string>();
  cards.forEach((card, index) => {
    const key = cardKey(card);
    if (seen.has(key)) throw new DeckParseError(`Card #${index + 1} repeats an earlier term and definition.`);
    seen.add(key);
  });
}

function parseCard(entry: unknown, number: number): Card {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    throw new DeckParseError(`Card #${number} must be an object with {term, definition}.`);
  }
  const record = entry as Record<string, unknown>;
  const definition = String(record.definition ?? "").trim();
  if (!definition) throw new DeckParseError(`Card #${number} must include a non-empty "definition" string.`);
  const term = String(record.term ?? "").trim();
  const imageRaw = record.image == null ? "" : String(record.image).trim();
  if (!term && !imageRaw) {
    throw new DeckParseError(`Card #${number} must include a non-empty "term" string or an "image".`);
  }
  let image = "";
  if (imageRaw) {
    const lowered = imageRaw.toLowerCase();
    if (lowered.startsWith("https://") || lowered.startsWith("data:image/")) image = imageRaw;
    else {
      throw new DeckParseError(`Card #${number} image must be an https URL or a data:image URI.`);
    }
  }
  return { term, definition, image, enabled: record.enabled !== false };
}

export class MemoryProgress implements Progress {
  readonly stats = new Map<string, Stats>();

  constructor(
    readonly deckId: string,
    initial: Iterable<[string, Stats]> = [],
    private persist: (key: string, stats: Stats) => void = () => undefined,
  ) {
    for (const [key, value] of initial) this.stats.set(key, { ...value });
  }

  get(deckId: string, key: string): Stats {
    if (deckId !== this.deckId) return { e: 0, c: 0, ls: 0 };
    return this.stats.get(key) ?? { e: 0, c: 0, ls: 0 };
  }

  record(deckId: string, key: string, correct: boolean, nowMs: number): void {
    const current = this.get(deckId, key);
    const next = {
      e: current.e + (correct ? 0 : 1),
      c: current.c + (correct ? 1 : 0),
      ls: nowMs,
    };
    this.stats.set(key, next);
    this.persist(key, next);
  }

  totals(): [number, number] {
    let corrects = 0;
    let errors = 0;
    for (const stats of this.stats.values()) {
      corrects += stats.c;
      errors += stats.e;
    }
    return [corrects, errors];
  }
}

export class Session {
  mode = STANDARD;
  chunkSize = 10;
  startWithTerm = true;
  shuffle = false;
  sessionMistakes = 0;
  cardMistakes: Record<number, number> = {};
  checked = false;
  wasCorrect = false;
  correctionRequired = false;
  order: number[] = [];
  cursor = 0;
  chunkStart = 0;
  mastered = new Set<number>();
  weightedIndex = 0;

  constructor(
    readonly deckId: string,
    readonly cards: Card[],
    readonly progress: Progress,
    readonly rng: Rng = defaultRng(),
  ) {
    if (cards.length === 0) throw new Error("A session needs at least one card.");
    if (this.playable().length === 0) throw new Error("Turn at least one card on.");
    this.restart();
  }

  private playable(): number[] {
    return this.cards.map((_, index) => index).filter((index) => cardEnabled(this.cards[index]));
  }

  restart(): void {
    this.sessionMistakes = 0;
    this.cardMistakes = {};
    this.checked = false;
    this.wasCorrect = false;
    this.correctionRequired = false;
    this.order = this.playable();
    if (this.shuffle && this.mode !== WEIGHTED) this.rng.shuffle(this.order);
    this.cursor = 0;
    this.chunkStart = 0;
    this.mastered = new Set();
    if (this.mode === WEIGHTED) this.weightedIndex = this.pickWeighted(null);
  }

  setMode(mode: string): void {
    if (mode !== STANDARD && mode !== CHUNKING && mode !== WEIGHTED) throw new Error(mode);
    if (mode === this.mode) return;
    const current = this.currentIndex();
    this.mode = mode;
    if (mode === WEIGHTED) {
      this.weightedIndex = current;
      return;
    }
    if (mode === CHUNKING) this.mastered = new Set();
    this.pin(current);
  }

  setChunkSize(size: number): void {
    const current = this.currentIndex();
    this.chunkSize = Math.max(1, Math.floor(size));
    if (this.mode === CHUNKING) this.pin(current);
  }

  setStartWithTerm(startWithTerm: boolean): void {
    if (this.startWithTerm === startWithTerm) return;
    this.startWithTerm = startWithTerm;
    this.checked = false;
    this.wasCorrect = false;
    this.correctionRequired = false;
  }

  setShuffle(shuffle: boolean): void {
    if (this.shuffle === shuffle) return;
    const current = this.currentIndex();
    this.shuffle = shuffle;
    if (this.mode === WEIGHTED) return;
    if (!shuffle) {
      this.order = this.playable();
    } else {
      const pos = Math.max(0, this.order.indexOf(current));
      const others = this.order.filter((item) => item !== current);
      this.rng.shuffle(others);
      others.splice(pos, 0, current);
      this.order = others;
    }
    this.pin(current);
  }

  private pin(current: number): void {
    const pos = Math.max(0, this.order.indexOf(current));
    if (this.mode !== CHUNKING) {
      this.cursor = pos;
      return;
    }
    if (pos < this.chunkStart || pos >= this.chunkStart + this.chunkSize) {
      const aligned = Math.floor(pos / this.chunkSize) * this.chunkSize;
      const maxStart = Math.max(0, this.order.length - this.chunkSize);
      this.chunkStart = Math.min(aligned, maxStart);
      if (pos < this.chunkStart || pos >= this.chunkStart + this.chunkSize) {
        this.chunkStart = Math.max(0, Math.min(pos, this.order.length - 1));
      }
    }
    const window = this.chunk();
    const cursor = window.indexOf(current);
    this.cursor = cursor >= 0 ? cursor : 0;
    for (const item of this.mastered) {
      if (!window.includes(item)) this.mastered.delete(item);
    }
  }

  currentIndex(): number {
    if (this.mode === WEIGHTED) return this.weightedIndex;
    if (this.mode === CHUNKING) {
      const window = this.chunk();
      return window[this.cursor % window.length];
    }
    return this.order[this.cursor % this.order.length];
  }

  currentCard(): Card {
    return this.cards[this.currentIndex()];
  }

  showingTerm(): boolean {
    return promptIsTerm(this.currentCard(), this.startWithTerm);
  }

  expectedText(card: Card = this.currentCard()): string {
    if (promptIsTerm(card, this.startWithTerm)) return card.definition;
    return card.term;
  }

  promptText(): string {
    const card = this.currentCard();
    return this.showingTerm() ? card.term : card.definition;
  }

  promptImage(): string {
    return this.showingTerm() ? this.currentCard().image : "";
  }

  positionLabel(): string {
    const index = this.currentIndex();
    const total = this.cards.length;
    if (this.mode === CHUNKING) {
      const window = this.chunk();
      const mastered = window.filter((item) => this.mastered.has(item)).length;
      const chunkNumber = Math.floor(this.chunkStart / this.chunkSize) + 1;
      return `Chunk ${chunkNumber}: ${mastered}/${window.length} - ${index + 1}/${total}`;
    }
    return `${index + 1} / ${total}`;
  }

  jumpTo(cardNumber: number): string {
    if (!Number.isInteger(cardNumber) || cardNumber < 1 || cardNumber > this.cards.length) return "missing";
    const index = cardNumber - 1;
    if (!cardEnabled(this.cards[index])) return "off";
    this.checked = false;
    this.wasCorrect = false;
    this.correctionRequired = false;
    if (this.mode === WEIGHTED) {
      this.weightedIndex = index;
      return "ok";
    }
    this.pin(index);
    return "ok";
  }

  matches(typed: string): boolean {
    const expected = normalizeAnswer(this.expectedText());
    const given = normalizeAnswer(typed);
    return Boolean(given) && given === expected;
  }

  check(typed: string, nowMs: number): string {
    if (this.checked) return "already";
    const card = this.currentCard();
    const correct = this.matches(typed);
    this.progress.record(this.deckId, cardKey(card), correct, nowMs);
    this.checked = true;
    this.wasCorrect = correct;
    if (correct) {
      if (this.mode === CHUNKING) this.mastered.add(this.currentIndex());
      this.correctionRequired = false;
      return "correct";
    }
    const index = this.currentIndex();
    this.sessionMistakes += 1;
    this.cardMistakes[index] = (this.cardMistakes[index] ?? 0) + 1;
    this.correctionRequired = true;
    return "wrong";
  }

  advance(typed: string): string {
    if (!this.checked) return "need-check";
    if (this.correctionRequired && !this.matches(typed)) return "need-correction";
    this.goNext();
    this.checked = false;
    this.wasCorrect = false;
    this.correctionRequired = false;
    return "advanced";
  }

  private goNext(): void {
    if (this.mode === WEIGHTED) {
      this.weightedIndex = this.pickWeighted(this.weightedIndex);
      return;
    }
    if (this.mode === CHUNKING) {
      this.advanceChunk();
      return;
    }
    this.cursor += 1;
    if (this.cursor >= this.order.length) {
      if (this.shuffle) this.rng.shuffle(this.order);
      this.cursor = 0;
    }
  }

  private advanceChunk(): void {
    const window = this.chunk();
    if (window.length && window.every((item) => this.mastered.has(item))) {
      this.chunkStart += this.chunkSize;
      this.mastered = new Set();
      this.cursor = 0;
      if (this.chunkStart >= this.order.length) {
        this.order = this.playable();
        if (this.shuffle) this.rng.shuffle(this.order);
        this.chunkStart = 0;
      }
      return;
    }
    for (let step = 1; step <= window.length; step += 1) {
      const next = (this.cursor + step) % window.length;
      if (!this.mastered.has(window[next])) {
        this.cursor = next;
        return;
      }
    }
  }

  private chunk(): number[] {
    return this.order.slice(this.chunkStart, this.chunkStart + this.chunkSize);
  }

  private pickWeighted(exclude: number | null): number {
    let indexes = this.playable().filter((index) => index !== exclude);
    if (indexes.length === 0) indexes = this.playable();
    const weights = indexes.map((index) => {
      const stats = this.progress.get(this.deckId, cardKey(this.cards[index]));
      return cardWeight(stats.e, stats.c);
    });
    return this.rng.choices(indexes, weights);
  }
}
