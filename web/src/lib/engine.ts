/** Character-accurate typing. Mirrors memotype/engine.py. */

export const PRACTICE = "practice";
export const RECALL = "recall";

const CURLY: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u00a0": " ",
  "\u200b": "",
};

export function isSpace(ch: string): boolean {
  return ch !== "" && ch.trim() === "";
}

export function normalizePassage(text: string): string {
  let next = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\t/g, "    ");
  next = next.replace(/[\u2018\u2019\u201c\u201d\u2013\u2014\u00a0\u200b]/g, (ch) => CURLY[ch] ?? ch);
  return next.trim();
}

export class Engine {
  text: string;
  mode: string;
  pos = 0;
  typed = "";
  typedScored = 0;
  score = 0;
  mistakes = 0;
  reveals = 0;
  correctKeystrokes = 0;
  startedAt: number | null = null;
  endedAt: number | null = null;
  revealed = false;

  constructor(text: string, mode: string) {
    if (mode !== PRACTICE && mode !== RECALL) throw new Error(`unknown mode: ${mode}`);
    this.text = normalizePassage(text);
    if (!this.text) throw new Error("empty passage");
    this.mode = mode;
    if (mode === RECALL) this.pos = this.wordStart(0);
  }

  private wordStart(index: number): number {
    while (index < this.text.length && isSpace(this.text[index])) index += 1;
    return index;
  }

  private wordEnd(index: number): number {
    while (index < this.text.length && !isSpace(this.text[index])) index += 1;
    return index;
  }

  get finished(): boolean {
    return this.endedAt !== null;
  }

  get currentWord(): string {
    if (this.mode !== RECALL || this.finished || this.pos >= this.text.length) return "";
    return this.text.slice(this.pos, this.wordEnd(this.pos));
  }

  visibleText(): string {
    if (this.mode === PRACTICE || this.finished) return this.text;
    return this.text.slice(0, this.pos) + this.typed;
  }

  progress(): number {
    if (!this.text) return 0;
    const cursor = this.mode === PRACTICE || this.finished ? this.pos : this.pos + this.typed.length;
    return Math.min(1, cursor / this.text.length);
  }

  wordTotal(): number {
    return this.text.split(/\s+/).filter(Boolean).length;
  }

  elapsed(now: number): number {
    if (this.startedAt === null) return 0;
    const end = this.endedAt ?? now;
    return Math.max(0, end - this.startedAt);
  }

  wpm(now: number): number {
    const seconds = this.elapsed(now);
    if (seconds <= 0 || this.correctKeystrokes <= 0) return 0;
    return this.correctKeystrokes / 5 / (seconds / 60);
  }

  accuracy(): number | null {
    const total = this.correctKeystrokes + this.mistakes;
    if (total === 0) return null;
    return (100 * this.correctKeystrokes) / total;
  }

  private startClock(now: number): void {
    if (this.startedAt === null && !this.finished) this.startedAt = now;
  }

  handleChar(ch: string, now: number): string {
    if (this.finished || !ch || ch.length !== 1) return "ignore";
    this.startClock(now);
    if (this.mode === PRACTICE) return this.practiceChar(ch, now);
    return this.recallChar(ch, now);
  }

  private finish(now: number): string {
    this.endedAt = now;
    this.revealed = false;
    this.typed = "";
    this.typedScored = 0;
    return "done";
  }

  private practiceChar(ch: string, now: number): string {
    if (this.pos >= this.text.length) return this.finish(now);
    const expected = this.text[this.pos];
    if (ch !== expected) {
      this.mistakes += 1;
      return "mistake";
    }
    this.pos += 1;
    this.correctKeystrokes += 1;
    if (!isSpace(expected)) this.score += 1;
    if (this.pos >= this.text.length) return this.finish(now);
    return "ok";
  }

  private recallChar(ch: string, now: number): string {
    const word = this.currentWord;
    if (!word) return this.finish(now);
    if (ch === " " && !this.typed && this.pos > 0 && isSpace(this.text[this.pos - 1])) return "ignore";
    const index = this.typed.length;
    if (ch !== word[index]) {
      this.mistakes += 1;
      return "mistake";
    }
    this.typed += ch;
    this.correctKeystrokes += 1;
    if (!this.revealed) {
      this.typedScored += 1;
      this.score += 1;
    }
    if (this.typed !== word) return "ok";
    const end = this.pos + word.length;
    this.pos = this.wordStart(end);
    this.typed = "";
    this.typedScored = 0;
    this.revealed = false;
    if (this.pos >= this.text.length) return this.finish(now);
    return "ok";
  }

  backspace(): void {
    if (this.finished) return;
    if (this.mode === PRACTICE) {
      if (this.pos === 0) return;
      this.pos -= 1;
      this.correctKeystrokes = Math.max(0, this.correctKeystrokes - 1);
      if (!isSpace(this.text[this.pos])) this.score = Math.max(0, this.score - 1);
      return;
    }
    if (!this.typed) return;
    this.typed = this.typed.slice(0, -1);
    this.correctKeystrokes = Math.max(0, this.correctKeystrokes - 1);
    if (this.typedScored > this.typed.length) {
      this.typedScored -= 1;
      this.score = Math.max(0, this.score - 1);
    }
  }

  reveal(now: number): boolean {
    if (this.mode !== RECALL || this.finished || !this.currentWord) return false;
    this.startClock(now);
    if (!this.revealed) {
      this.revealed = true;
      this.reveals += 1;
    }
    return true;
  }

  snapshot(): EngineSnapshot {
    return {
      pos: this.pos,
      typed: this.typed,
      typedScored: this.typedScored,
      score: this.score,
      mistakes: this.mistakes,
      reveals: this.reveals,
      correctKeystrokes: this.correctKeystrokes,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      revealed: this.revealed,
    };
  }

  restore(snapshot: EngineSnapshot): void {
    this.pos = Math.min(Math.max(0, Math.floor(snapshot.pos)), this.text.length);
    this.typed = snapshot.typed ?? "";
    this.typedScored = Math.max(0, snapshot.typedScored ?? 0);
    this.score = Math.max(0, snapshot.score ?? 0);
    this.mistakes = Math.max(0, snapshot.mistakes ?? 0);
    this.reveals = Math.max(0, snapshot.reveals ?? 0);
    this.correctKeystrokes = Math.max(0, snapshot.correctKeystrokes ?? 0);
    this.startedAt = snapshot.startedAt;
    this.endedAt = snapshot.endedAt;
    this.revealed = Boolean(snapshot.revealed);
  }
}

export type EngineSnapshot = {
  pos: number;
  typed: string;
  typedScored: number;
  score: number;
  mistakes: number;
  reveals: number;
  correctKeystrokes: number;
  startedAt: number | null;
  endedAt: number | null;
  revealed: boolean;
};
