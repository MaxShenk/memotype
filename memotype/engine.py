"""Typing session rules for practice and recall."""

from __future__ import annotations

PRACTICE = "practice"
RECALL = "recall"

_CURLY = str.maketrans(
    {
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2013": "-",
        "\u2014": "-",
        "\u00a0": " ",
        "\u200b": "",
    }
)


def normalize(text: str) -> str:
    """Make pasted text predictable without changing the words."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\t", "    ")
    text = text.translate(_CURLY)
    return text.strip()


class Engine:
    """Character-accurate typing.

    Practice shows the whole passage. A wrong key is rejected and counted.
    Recall hides every unfinished word. Whitespace is inserted for you after
    a word is finished. Ctrl+R marks the current word as revealed: it still
    has to be typed, and those characters do not add points.
    """

    def __init__(self, text: str, mode: str):
        if mode not in (PRACTICE, RECALL):
            raise ValueError(f"unknown mode: {mode}")
        self.text = normalize(text)
        if not self.text:
            raise ValueError("empty passage")
        self.mode = mode
        self.pos = 0
        self.typed = ""
        self.typed_scored = 0
        self.score = 0
        self.mistakes = 0
        self.reveals = 0
        self.correct_keystrokes = 0
        self.started_at: float | None = None
        self.ended_at: float | None = None
        self.revealed = False
        if mode == RECALL:
            self.pos = self._word_start(0)

    def _word_start(self, index: int) -> int:
        length = len(self.text)
        while index < length and self.text[index].isspace():
            index += 1
        return index

    def _word_end(self, index: int) -> int:
        length = len(self.text)
        while index < length and not self.text[index].isspace():
            index += 1
        return index

    @property
    def finished(self) -> bool:
        return self.ended_at is not None

    @property
    def current_word(self) -> str:
        if self.mode != RECALL or self.finished or self.pos >= len(self.text):
            return ""
        return self.text[self.pos : self._word_end(self.pos)]

    def visible_text(self) -> str:
        """Text the player is allowed to see inside the passage."""
        if self.mode == PRACTICE or self.finished:
            return self.text
        return self.text[: self.pos] + self.typed

    def progress(self) -> float:
        if not self.text:
            return 0.0
        cursor = self.pos if self.mode == PRACTICE or self.finished else self.pos + len(self.typed)
        return min(1.0, cursor / len(self.text))

    def word_total(self) -> int:
        return len(self.text.split())

    def word_index(self) -> int:
        """1-based index of the word being typed. Equals the total when done."""
        done = len(self.text[: self.pos].split()) if self.mode == RECALL else len(self.text[: self.pos].split())
        if self.finished:
            return max(done, self.word_total())
        if self.mode == RECALL:
            return done + 1 if self.current_word else done
        return done + (0 if self.pos >= len(self.text) or self.text[self.pos].isspace() else 1)

    def start_clock(self, now: float) -> None:
        if self.started_at is None and not self.finished:
            self.started_at = now

    def elapsed(self, now: float) -> float:
        if self.started_at is None:
            return 0.0
        end = self.ended_at if self.ended_at is not None else now
        return max(0.0, end - self.started_at)

    def wpm(self, now: float) -> float:
        seconds = self.elapsed(now)
        if seconds <= 0 or self.correct_keystrokes <= 0:
            return 0.0
        return (self.correct_keystrokes / 5) / (seconds / 60)

    def accuracy(self) -> float | None:
        total = self.correct_keystrokes + self.mistakes
        if total == 0:
            return None
        return 100.0 * self.correct_keystrokes / total

    def handle_char(self, ch: str, now: float) -> str:
        """Return ok, mistake, done, or ignore."""
        if self.finished or not ch or len(ch) != 1:
            return "ignore"
        self.start_clock(now)
        if self.mode == PRACTICE:
            return self._practice_char(ch, now)
        return self._recall_char(ch, now)

    def _finish(self, now: float) -> str:
        self.ended_at = now
        self.revealed = False
        self.typed = ""
        self.typed_scored = 0
        return "done"

    def _practice_char(self, ch: str, now: float) -> str:
        if self.pos >= len(self.text):
            return self._finish(now)
        expected = self.text[self.pos]
        if ch != expected:
            self.mistakes += 1
            return "mistake"
        self.pos += 1
        self.correct_keystrokes += 1
        if not expected.isspace():
            self.score += 1
        if self.pos >= len(self.text):
            return self._finish(now)
        return "ok"

    def _recall_char(self, ch: str, now: float) -> str:
        word = self.current_word
        if not word:
            return self._finish(now)
        # The word is already committed on its last letter, so the space
        # typed between words is the gap, not a wrong character.
        if ch == " " and not self.typed and self.pos > 0 and self.text[self.pos - 1].isspace():
            return "ignore"
        index = len(self.typed)
        if ch != word[index]:
            self.mistakes += 1
            return "mistake"
        self.typed += ch
        self.correct_keystrokes += 1
        if not self.revealed:
            self.typed_scored += 1
            self.score += 1
        if self.typed != word:
            return "ok"
        end = self.pos + len(word)
        self.pos = self._word_start(end)
        self.typed = ""
        self.typed_scored = 0
        self.revealed = False
        if self.pos >= len(self.text):
            return self._finish(now)
        return "ok"

    def backspace(self) -> None:
        if self.finished:
            return
        if self.mode == PRACTICE:
            if self.pos == 0:
                return
            self.pos -= 1
            self.correct_keystrokes = max(0, self.correct_keystrokes - 1)
            if not self.text[self.pos].isspace():
                self.score = max(0, self.score - 1)
            return
        if not self.typed:
            return
        self.typed = self.typed[:-1]
        self.correct_keystrokes = max(0, self.correct_keystrokes - 1)
        if self.typed_scored > len(self.typed):
            self.typed_scored -= 1
            self.score = max(0, self.score - 1)

    def reveal(self, now: float) -> bool:
        """Reveal the current recall word. Returns True when a word is showing."""
        if self.mode != RECALL or self.finished or not self.current_word:
            return False
        self.start_clock(now)
        if not self.revealed:
            self.revealed = True
            self.reveals += 1
        return True
