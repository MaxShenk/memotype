"""Which card comes next, and whether the typed answer is right."""

from __future__ import annotations

import random
import unicodedata

from memotype.flashcards.loader import Card
from memotype.flashcards.progress import ProgressStore

STANDARD = "standard"
CHUNKING = "chunking"
WEIGHTED = "weighted"


def normalize(text: str) -> str:
    decomposed = unicodedata.normalize("NFD", text)
    without_marks = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    return " ".join(without_marks.split()).lower()


def card_weight(errors: int, corrects: int) -> int:
    return max(1, 1 + 3 * errors - (corrects // 3))


def hardest_rows(cards: list[Card], progress: ProgressStore, deck_id: str, limit: int = 12) -> list[dict]:
    rows = []
    for index, card in enumerate(cards):
        stats = progress.get(deck_id, card.key())
        attempts = stats["e"] + stats["c"]
        if attempts == 0:
            continue
        rows.append(
            {
                "index": index + 1,
                "term": card.term or "(image)",
                "definition": card.definition,
                "e": stats["e"],
                "c": stats["c"],
                "accuracy": stats["c"] / attempts,
                "weight": card_weight(stats["e"], stats["c"]),
            }
        )
    rows.sort(key=lambda row: (-row["weight"], -row["e"], row["accuracy"]))
    return rows[:limit]


def prompt_is_term(card: Card, start_with_term: bool) -> bool:
    """True when the term side, including its picture, is what the player sees."""
    if start_with_term:
        if not card.definition.strip():
            return False
        return True
    if not card.term.strip():
        return True
    return False


class Session:
    def __init__(self, deck_id: str, cards: list[Card], progress: ProgressStore, rng: random.Random | None = None):
        if not cards:
            raise ValueError("A session needs at least one card.")
        self.deck_id = deck_id
        self.cards = cards
        self.progress = progress
        self.rng = rng or random.Random()
        self.mode = STANDARD
        self.chunk_size = 10
        self.start_with_term = True
        self.shuffle = False
        self.session_mistakes = 0
        self.card_mistakes: dict[int, int] = {}
        self.checked = False
        self.was_correct = False
        self.correction_required = False
        self.order: list[int] = []
        self.cursor = 0
        self.chunk_start = 0
        self.mastered: set[int] = set()
        self.weighted_index = 0
        self.restart()

    def restart(self) -> None:
        self.session_mistakes = 0
        self.card_mistakes = {}
        self.checked = False
        self.was_correct = False
        self.correction_required = False
        self.order = list(range(len(self.cards)))
        if self.shuffle and self.mode != WEIGHTED:
            self.rng.shuffle(self.order)
        self.cursor = 0
        self.chunk_start = 0
        self.mastered = set()
        if self.mode == WEIGHTED:
            self.weighted_index = self._pick_weighted(None)

    def set_mode(self, mode: str) -> None:
        if mode not in (STANDARD, CHUNKING, WEIGHTED):
            raise ValueError(mode)
        if mode == self.mode:
            return
        current = self.current_index()
        self.mode = mode
        if mode == WEIGHTED:
            self.weighted_index = current
            return
        if mode == CHUNKING:
            self.mastered = set()
        self._pin(current)

    def set_chunk_size(self, size: int) -> None:
        current = self.current_index()
        self.chunk_size = max(1, int(size))
        if self.mode == CHUNKING:
            self._pin(current)

    def set_start_with_term(self, start_with_term: bool) -> None:
        if self.start_with_term == start_with_term:
            return
        self.start_with_term = start_with_term
        self.checked = False
        self.was_correct = False
        self.correction_required = False

    def set_shuffle(self, shuffle: bool) -> None:
        if self.shuffle == shuffle:
            return
        current = self.current_index()
        self.shuffle = shuffle
        if self.mode == WEIGHTED:
            return
        if not shuffle:
            self.order = list(range(len(self.cards)))
        else:
            pos = self.order.index(current) if current in self.order else 0
            others = [item for item in self.order if item != current]
            self.rng.shuffle(others)
            others.insert(pos, current)
            self.order = others
        self._pin(current)

    def _pin(self, current: int) -> None:
        pos = self.order.index(current) if current in self.order else 0
        if self.mode != CHUNKING:
            self.cursor = pos
            return
        if pos < self.chunk_start or pos >= self.chunk_start + self.chunk_size:
            aligned = (pos // self.chunk_size) * self.chunk_size
            max_start = max(0, len(self.order) - self.chunk_size)
            self.chunk_start = min(aligned, max_start)
            if pos < self.chunk_start or pos >= self.chunk_start + self.chunk_size:
                self.chunk_start = max(0, min(pos, len(self.order) - 1))
        window = self._chunk()
        self.cursor = window.index(current) if current in window else 0
        self.mastered = {item for item in self.mastered if item in window}

    def current_index(self) -> int:
        if self.mode == WEIGHTED:
            return self.weighted_index
        if self.mode == CHUNKING:
            window = self._chunk()
            return window[self.cursor % len(window)]
        return self.order[self.cursor % len(self.order)]

    def current_card(self) -> Card:
        return self.cards[self.current_index()]

    def showing_term(self) -> bool:
        return prompt_is_term(self.current_card(), self.start_with_term)

    def expected_text(self, card: Card | None = None) -> str:
        card = self.current_card() if card is None else card
        if prompt_is_term(card, self.start_with_term):
            return card.definition
        return card.term

    def prompt_text(self) -> str:
        card = self.current_card()
        if self.showing_term():
            return card.term
        return card.definition

    def prompt_image(self) -> str:
        if self.showing_term():
            return self.current_card().image
        return ""

    def position_label(self) -> str:
        index = self.current_index()
        total = len(self.cards)
        if self.mode == CHUNKING:
            window = self._chunk()
            mastered = sum(1 for item in window if item in self.mastered)
            chunk_number = self.chunk_start // self.chunk_size + 1
            return f"Chunk {chunk_number}: {mastered}/{len(window)} - {index + 1}/{total}"
        return f"{index + 1} / {total}"

    def matches(self, typed: str) -> bool:
        expected = normalize(self.expected_text())
        given = normalize(typed)
        return bool(given) and given == expected

    def check(self, typed: str, now_ms: int) -> str:
        if self.checked:
            return "already"
        card = self.current_card()
        correct = self.matches(typed)
        self.progress.record(self.deck_id, card.key(), correct, now_ms)
        self.checked = True
        self.was_correct = correct
        if correct:
            if self.mode == CHUNKING:
                self.mastered.add(self.current_index())
            self.correction_required = False
            return "correct"
        index = self.current_index()
        self.session_mistakes += 1
        self.card_mistakes[index] = self.card_mistakes.get(index, 0) + 1
        self.correction_required = True
        return "wrong"

    def advance(self, typed: str) -> str:
        if not self.checked:
            return "need-check"
        if self.correction_required and not self.matches(typed):
            return "need-correction"
        self._go_next()
        self.checked = False
        self.was_correct = False
        self.correction_required = False
        return "advanced"

    def _go_next(self) -> None:
        if self.mode == WEIGHTED:
            self.weighted_index = self._pick_weighted(self.weighted_index)
            return
        if self.mode == CHUNKING:
            self._advance_chunk()
            return
        self.cursor += 1
        if self.cursor >= len(self.order):
            if self.shuffle:
                self.rng.shuffle(self.order)
            self.cursor = 0

    def _advance_chunk(self) -> None:
        window = self._chunk()
        if window and all(item in self.mastered for item in window):
            self.chunk_start += self.chunk_size
            self.mastered = set()
            self.cursor = 0
            if self.chunk_start >= len(self.order):
                self.order = list(range(len(self.cards)))
                if self.shuffle:
                    self.rng.shuffle(self.order)
                self.chunk_start = 0
            return
        for step in range(1, len(window) + 1):
            nxt = (self.cursor + step) % len(window)
            if window[nxt] not in self.mastered:
                self.cursor = nxt
                return

    def _chunk(self) -> list[int]:
        return self.order[self.chunk_start : self.chunk_start + self.chunk_size]

    def _pick_weighted(self, exclude: int | None) -> int:
        indexes = [index for index in range(len(self.cards)) if index != exclude]
        if not indexes:
            indexes = list(range(len(self.cards)))
        weights = []
        for index in indexes:
            stats = self.progress.get(self.deck_id, self.cards[index].key())
            weights.append(card_weight(stats["e"], stats["c"]))
        return self.rng.choices(indexes, weights=weights, k=1)[0]

    def weight_for(self, index: int) -> int:
        stats = self.progress.get(self.deck_id, self.cards[index].key())
        return card_weight(stats["e"], stats["c"])
