import { normalizeAnswer } from "./flash";

export const OFFLINE_MESSAGE = "Sentences needs an internet connection. The other practice modes work offline.";
export const UNAVAILABLE_MESSAGE = "The check could not be completed. Try again.";
export const MAX_SENTENCE_CHARS = 400;

const SUFFIXES = ["s", "es", "ed", "ing", "ly", "er", "est", "d"];

export type SentenceGate = { ok: true } | { ok: false; reason: string };

export type SentenceGrade =
  | { status: "pass" }
  | { status: "miss"; reason: string }
  | { status: "offline" }
  | { status: "unavailable" };

export const SENTENCE_FIXTURES = [
  {
    name: "clear yes",
    word: "ephemeral",
    gloss: "adjective. lasting for a very short time",
    sentence: "The ephemeral rainbow faded before we reached the hill.",
    gate: "pass",
  },
  {
    name: "clear wrong sense",
    word: "bank",
    gloss: "noun. the land along the side of a river",
    sentence: "I deposited the check at the bank on Main Street.",
    gate: "pass",
  },
  {
    name: "definition copy",
    word: "ephemeral",
    gloss: "adjective. lasting for a very short time",
    sentence: "Ephemeral means lasting for a very short time.",
    gate: "definition",
  },
  {
    name: "missing word",
    word: "ephemeral",
    gloss: "adjective. lasting for a very short time",
    sentence: "The rainbow faded before we reached the hill.",
    gate: "missing",
  },
] as const;

function words(text: string): string[] {
  return normalizeAnswer(text).replace(/[^\p{L}\p{N}\s']/gu, " ").split(/\s+/).filter(Boolean);
}

function tokenUses(token: string, word: string): boolean {
  if (token === word) return true;
  if (word.length < 3) return false;
  if (token.startsWith(word) && SUFFIXES.includes(token.slice(word.length))) return true;
  if (word.endsWith("e")) {
    const stem = word.slice(0, -1);
    const rest = token.slice(stem.length);
    if (token.startsWith(stem) && ["ing", "ed", "er", "est"].includes(rest)) return true;
  }
  if (word.endsWith("y") && word.length > 2) {
    const stem = `${word.slice(0, -1)}i`;
    const rest = token.slice(stem.length);
    if (token.startsWith(stem) && ["es", "ed", "er", "est", "ly"].includes(rest)) return true;
  }
  return false;
}

export function sentenceUsesWord(sentence: string, word: string): boolean {
  const parts = words(word);
  if (parts.length === 0) return false;
  const haystack = words(sentence);
  let from = 0;
  for (const part of parts) {
    const found = haystack.slice(from).findIndex((token) => tokenUses(token, part));
    if (found < 0) return false;
    from += found + 1;
  }
  return true;
}

function sentenceCount(text: string): number {
  const parts = text.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean);
  return parts.length;
}

function copiesGloss(word: string, gloss: string, sentence: string): boolean {
  const glossBody = gloss.replace(/^[a-z]+\.\s*/i, "").trim();
  const given = words(sentence).join(" ");
  const expected = words(glossBody).join(" ");
  if (expected.length >= 12 && (given === expected || given.includes(expected))) return true;
  const head = words(word)[0] ?? "";
  if (!head) return false;
  return new RegExp(`^(the word )?${head} (means|meant|is defined as|refers to)\\b`).test(given);
}

export function sentenceGate(word: string, gloss: string, sentence: string): SentenceGate {
  const trimmed = sentence.trim();
  if (!word.trim()) return { ok: false, reason: "This card has no word to use in a sentence." };
  if (!trimmed || words(trimmed).length < 3) return { ok: false, reason: "Write one or two sentences." };
  if (trimmed.length > MAX_SENTENCE_CHARS) return { ok: false, reason: "That sentence is too long to check." };
  if (sentenceCount(trimmed) > 2) return { ok: false, reason: "Write one or two sentences." };
  if (copiesGloss(word, gloss, trimmed)) return { ok: false, reason: "Use the word in your own sentence, not the definition." };
  if (!sentenceUsesWord(trimmed, word)) return { ok: false, reason: "Use the word in the sentence." };
  return { ok: true };
}

export function buildSentencePrompt(word: string, gloss: string, sentence: string): string {
  return [
    "You grade whether a learner used an English word in the sense of a short glossary entry.",
    "",
    `Word: ${word.trim()}`,
    `Glossary: ${gloss.trim()}`,
    "",
    `Sentence: ${sentence.trim()}`,
    "",
    "Reply with yes if the sentence uses the word in that sense. Awkward grammar is fine.",
    "Reply with no if the sense is different, the sentence only defines the word, or the word is not really used.",
    "On no, add a colon and one short reason.",
    "Answer with yes or no only.",
  ].join("\n");
}

export function parseSentenceVerdict(text: string): { ok: boolean; reason: string } {
  const cleaned = text.trim().toLowerCase();
  if (cleaned.startsWith("yes")) return { ok: true, reason: "" };
  const reason = text.replace(/^\s*no\b[:\-\s]*/i, "").trim().slice(0, 160);
  return { ok: false, reason: reason || "That does not use the word in this sense." };
}

function offlineNow(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

export async function gradeSentence(word: string, gloss: string, sentence: string): Promise<SentenceGrade> {
  const gate = sentenceGate(word, gloss, sentence);
  if (!gate.ok) return { status: "miss", reason: gate.reason };
  if (offlineNow()) return { status: "offline" };
  try {
    const response = await fetch("/api/sentence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ word: word.trim(), gloss: gloss.trim(), sentence: sentence.trim() }),
    });
    if (offlineNow()) return { status: "offline" };
    if (!response.ok) return { status: "unavailable" };
    const body = await response.json() as { ok?: boolean; reason?: string; error?: string };
    if (body.error) return { status: "unavailable" };
    if (body.ok) return { status: "pass" };
    return { status: "miss", reason: body.reason?.trim() || "That does not use the word in this sense." };
  } catch {
    if (offlineNow()) return { status: "offline" };
    return { status: "unavailable" };
  }
}
