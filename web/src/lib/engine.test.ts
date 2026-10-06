import { describe, expect, it } from "vitest";
import { Engine, normalizePassage } from "./engine";

describe("normalizePassage", () => {
  it("cleans newlines quotes and edges", () => {
    expect(normalizePassage("  “Hello”\r\nworld\t \n")).toBe('"Hello"\nworld');
  });
});

describe("practice", () => {
  it("rejects a miss, undoes a point, and finishes", () => {
    const engine = new Engine("a\nb", "practice");
    expect(engine.handleChar("z", 10)).toBe("mistake");
    expect(engine.mistakes).toBe(1);
    expect(engine.pos).toBe(0);
    expect(engine.handleChar("a", 10)).toBe("ok");
    expect(engine.score).toBe(1);
    engine.backspace();
    expect(engine.pos).toBe(0);
    expect(engine.score).toBe(0);
    expect(engine.handleChar("a", 10)).toBe("ok");
    expect(engine.handleChar("\n", 20)).toBe("ok");
    expect(engine.score).toBe(1);
    expect(engine.handleChar("b", 70)).toBe("done");
    expect(engine.finished).toBe(true);
    expect(engine.score).toBe(2);
    expect(engine.elapsed(999)).toBe(60);
    expect(engine.wpm(999)).toBeCloseTo(3 / 5);
  });

  it("does not score spaces", () => {
    const engine = new Engine("a b", "practice");
    engine.handleChar("a", 1);
    engine.handleChar(" ", 2);
    expect(engine.score).toBe(1);
    expect(engine.handleChar("b", 3)).toBe("done");
    expect(engine.score).toBe(2);
  });
});

describe("recall", () => {
  it("hides future words", () => {
    const engine = new Engine("alpha beta", "recall");
    expect(engine.visibleText()).toBe("");
    expect(engine.currentWord).toBe("alpha");
    for (const ch of "alpha") expect(engine.handleChar(ch, 1)).toBe("ok");
    expect(engine.visibleText()).toBe("alpha ");
    expect(engine.currentWord).toBe("beta");
    expect(engine.visibleText().includes("beta")).toBe(false);
    expect(["b", "e", "t"].map((ch) => engine.handleChar(ch, 2)).join("")).toBe("okokok");
    expect(engine.handleChar("a", 8)).toBe("done");
    expect(engine.score).toBe(9);
    expect(engine.visibleText()).toBe("alpha beta");
  });

  it("ignores the space between words", () => {
    const engine = new Engine("alpha beta", "recall");
    for (const ch of "alpha") engine.handleChar(ch, 1);
    expect(engine.handleChar(" ", 2)).toBe("ignore");
    expect(engine.mistakes).toBe(0);
    expect(engine.handleChar("b", 3)).toBe("ok");
    expect(engine.handleChar(" ", 4)).toBe("mistake");
    const fresh = new Engine("alpha beta", "recall");
    expect(fresh.handleChar(" ", 1)).toBe("mistake");
  });

  it("scores nothing for a revealed word", () => {
    const engine = new Engine("ab cd", "recall");
    expect(engine.reveal(1)).toBe(true);
    expect(engine.reveal(1)).toBe(true);
    expect(engine.reveals).toBe(1);
    expect(engine.handleChar("a", 2)).toBe("ok");
    expect(engine.score).toBe(0);
    engine.backspace();
    expect(engine.score).toBe(0);
    engine.handleChar("a", 3);
    engine.handleChar("b", 4);
    expect(engine.currentWord).toBe("cd");
    expect(engine.revealed).toBe(false);
    engine.handleChar("c", 5);
    expect(engine.score).toBe(1);
    engine.reveal(6);
    expect(engine.handleChar("d", 7)).toBe("done");
    expect(engine.score).toBe(1);
  });
});
