"""Lifetime correct and error counts for each card in a deck."""

from __future__ import annotations

import json
from pathlib import Path


def empty_stats() -> dict:
    return {"e": 0, "c": 0, "ls": 0}


class ProgressStore:
    def __init__(self, path: Path):
        self.path = path

    def _load(self) -> dict:
        if not self.path.exists():
            return {"decks": {}}
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {"decks": {}}
        if not isinstance(data, dict) or not isinstance(data.get("decks"), dict):
            return {"decks": {}}
        return data

    def _save(self, data: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps(data, indent=2), encoding="utf-8")
        temporary.replace(self.path)

    def get(self, deck_id: str, card_key: str) -> dict:
        raw = self._load().get("decks", {}).get(deck_id, {}).get("cards", {}).get(card_key, {})
        if not isinstance(raw, dict):
            return empty_stats()
        return {
            "e": int(raw.get("e", 0) or 0),
            "c": int(raw.get("c", 0) or 0),
            "ls": int(raw.get("ls", 0) or 0),
        }

    def record(self, deck_id: str, card_key: str, correct: bool, now_ms: int) -> dict:
        data = self._load()
        decks = data.setdefault("decks", {})
        deck = decks.setdefault(deck_id, {"cards": {}})
        cards = deck.setdefault("cards", {})
        current = cards.get(card_key, {})
        if not isinstance(current, dict):
            current = {}
        stats = {
            "e": int(current.get("e", 0) or 0),
            "c": int(current.get("c", 0) or 0),
            "ls": int(now_ms),
        }
        if correct:
            stats["c"] += 1
        else:
            stats["e"] += 1
        cards[card_key] = stats
        self._save(data)
        return stats

    def reset(self, deck_id: str) -> None:
        data = self._load()
        decks = data.setdefault("decks", {})
        if deck_id in decks:
            del decks[deck_id]
            self._save(data)

    def totals(self, deck_id: str) -> tuple[int, int]:
        cards = self._load().get("decks", {}).get(deck_id, {}).get("cards", {})
        if not isinstance(cards, dict):
            return 0, 0
        correct = 0
        errors = 0
        for raw in cards.values():
            if isinstance(raw, dict):
                correct += int(raw.get("c", 0) or 0)
                errors += int(raw.get("e", 0) or 0)
        return correct, errors
