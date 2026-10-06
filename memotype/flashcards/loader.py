"""Load a JSON deck and resolve any pictures on the cards."""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from pathlib import Path

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif", ".svg"}
MAX_IMAGE_BYTES = 4 * 1024 * 1024
_MIME = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".avif": "image/avif",
    ".svg": "image/svg+xml",
}


class DeckError(ValueError):
    pass


@dataclass
class Card:
    term: str
    definition: str
    image: str = ""

    def key(self) -> str:
        return self.term + "\u0000" + self.definition


@dataclass
class Deck:
    deck_id: str
    name: str
    path: str | None
    cards: list[Card]


def shorten_path(path: str) -> str:
    if len(path) <= 42:
        return path
    return path[:18] + "..." + path[-20:]


def load_json_file(path: Path) -> Deck:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise DeckError(f"Could not read this deck.\n\n{exc}") from exc
    cards = _parse_cards(raw, path.parent)
    return Deck(deck_id=f"file:{path.resolve()}", name=path.stem, path=str(path.resolve()), cards=cards)


def load_builtin(name: str, deck_id: str, path: Path) -> Deck:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise DeckError(f"Could not read the built-in deck.\n\n{exc}") from exc
    cards = _parse_cards(raw, path.parent)
    return Deck(deck_id=deck_id, name=name, path=None, cards=cards)


def _parse_cards(raw: object, folder: Path) -> list[Card]:
    if not isinstance(raw, list):
        raise DeckError("Cards file must export an array...")
    if not raw:
        raise DeckError("Cards file exported an empty array.")
    cards: list[Card] = []
    for index, entry in enumerate(raw, start=1):
        cards.append(_parse_card(entry, index, folder))
    return cards


def _parse_card(entry: object, number: int, folder: Path) -> Card:
    if not isinstance(entry, dict):
        raise DeckError(f"Card #{number} must be an object with {{term, definition}}.")
    definition = str(entry.get("definition", "")).strip()
    if not definition:
        raise DeckError(f'Card #{number} must include a non-empty "definition" string.')
    term = str(entry.get("term", "")).strip()
    image_raw = entry.get("image", "")
    image_raw = "" if image_raw is None else str(image_raw).strip()
    if not term and not image_raw:
        raise DeckError(f'Card #{number} must include a non-empty "term" string or an "image".')
    image = _resolve_image(image_raw, folder, number) if image_raw else ""
    return Card(term=term, definition=definition, image=image)


def _resolve_image(raw: str, folder: Path, number: int) -> str:
    lowered = raw.lower()
    if lowered.startswith("https://") or lowered.startswith("data:image/"):
        return raw
    if "://" in raw or lowered.startswith("data:"):
        raise DeckError(
            f"Card #{number} image must be an https URL, a data:image URI, or a local file path."
        )
    path = Path(raw)
    if not path.is_absolute():
        path = folder / path
    suffix = path.suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        kinds = ", ".join(sorted(ext[1:] for ext in ALLOWED_EXTENSIONS))
        raise DeckError(f"Card #{number} image must be one of: {kinds}.")
    if not path.exists():
        raise DeckError(f"Card #{number} image was not found: {path}")
    if not path.is_file():
        raise DeckError(f"Card #{number} image is not a file: {path}")
    size = path.stat().st_size
    if size > MAX_IMAGE_BYTES:
        megabytes = size / (1024 * 1024)
        raise DeckError(f"Card #{number} image is too large ({megabytes:.1f} MB): {path}")
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{_MIME[suffix]};base64,{encoded}"
