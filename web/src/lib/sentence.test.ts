import { describe, expect, it, vi } from "vitest";
import {
  SENTENCE_FIXTURES,
  buildSentencePrompt,
  gradeSentence,
  parseSentenceVerdict,
  sentenceGate,
  sentenceUsesWord,
} from "./sentence";

describe("sentence gates", () => {
  it("accepts an obvious inflection", () => {
    expect(sentenceUsesWord("The rainbow was ephemerally bright.", "ephemeral")).toBe(true);
  });

  it("grades the fixture list before any model call", () => {
    for (const fixture of SENTENCE_FIXTURES) {
      const gate = sentenceGate(fixture.word, fixture.gloss, fixture.sentence);
      if (fixture.gate === "pass") {
        expect(gate.ok, fixture.name).toBe(true);
        const prompt = buildSentencePrompt(fixture.word, fixture.gloss, fixture.sentence);
        expect(prompt).toContain(fixture.word);
        expect(prompt).toContain(fixture.gloss);
        expect(prompt).toContain(fixture.sentence);
        expect(prompt).toContain("Awkward grammar is fine.");
        expect(prompt).toContain("The first word of your reply must be yes or no.");
      } else if (fixture.gate === "definition") {
        expect(gate.ok, fixture.name).toBe(false);
        if (!gate.ok) expect(gate.reason).toMatch(/definition/);
      } else {
        expect(gate.ok, fixture.name).toBe(false);
        if (!gate.ok) expect(gate.reason).toMatch(/Use the word/);
      }
    }
  });

  it("rejects a third sentence and a pasted gloss", () => {
    const word = "ephemeral";
    const gloss = "adjective. lasting for a very short time";
    expect(sentenceGate(word, gloss, "One fades. Two fade. Three fade away now.").ok).toBe(false);
    expect(sentenceGate(word, gloss, "lasting for a very short time").ok).toBe(false);
  });
});

describe("gradeSentence", () => {
  it("stops before the model when the word is missing or the browser is offline", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const missing = await gradeSentence(
      "ephemeral",
      "adjective. lasting for a very short time",
      "The rainbow faded before we reached the hill.",
    );
    expect(missing.status).toBe("miss");
    vi.stubGlobal("navigator", { onLine: false });
    const offline = await gradeSentence(
      "ephemeral",
      "adjective. lasting for a very short time",
      "The ephemeral rainbow faded before we reached the hill.",
    );
    expect(offline).toEqual({ status: "offline" });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("sentence verdicts", () => {
  it("reads yes and a short no", () => {
    expect(parseSentenceVerdict("Yes")).toEqual({ ok: true, reason: "" });
    expect(parseSentenceVerdict("Answer: Yes, that uses the short-lived sense.")).toEqual({ ok: true, reason: "" });
    expect(parseSentenceVerdict("<think>\nThe glossary matches, so this is not a no.\n</think>\nyes")).toEqual({
      ok: true,
      reason: "",
    });
    expect(parseSentenceVerdict("no: that is the financial sense")).toEqual({
      ok: false,
      reason: "that is the financial sense",
    });
    expect(parseSentenceVerdict("maybe").ok).toBeNull();
  });

  it("lets a dictionary example through the local checks", () => {
    const gate = sentenceGate(
      "ephemeral",
      "adjective. lasting for a very short time",
      "The ephemeral beauty of the cherry blossoms draws crowds each spring.",
    );
    expect(gate.ok).toBe(true);
  });
});
