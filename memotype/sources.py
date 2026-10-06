"""Text-file sources stored in the user's MemoType folder."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from memotype.engine import normalize

SAMPLE_NAME = "Getting Started"
SAMPLE_TEXT = """Memory grows when you reach for a line before you look at it.

Read the passage once, then type the words you still hold. Each correct word is a light left on. If a word is gone, reveal it, then type it anyway. The fingers learn what the mind is still borrowing."""

_INVALID = '<>:"/\\|?*'
_RESERVED = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}


@dataclass
class Source:
    path: Path
    name: str
    text: str
    modified: datetime
    error: str | None = None

    @property
    def word_count(self) -> int:
        return len(self.text.split()) if self.text else 0

    @property
    def char_count(self) -> int:
        return len(self.text)


def sanitize_name(name: str) -> str:
    cleaned = "".join(ch for ch in name.strip() if ch not in _INVALID and ord(ch) >= 32)
    cleaned = " ".join(cleaned.split()).rstrip(" .")
    if not cleaned:
        cleaned = "Untitled"
    if cleaned.upper() in _RESERVED:
        cleaned = f"{cleaned}_"
    return cleaned[:80]


def read_text(path: Path) -> str:
    data = path.read_bytes()
    for encoding in ("utf-8-sig", "utf-8", "cp1252"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


class SourceStore:
    def __init__(self, folder: Path):
        self.folder = folder
        self.folder.mkdir(parents=True, exist_ok=True)

    def ensure_ready(self) -> None:
        """Create a sample passage the first time the folder is used."""
        self.folder.mkdir(parents=True, exist_ok=True)
        marker = self.folder / ".initialized"
        if marker.exists():
            return
        if not any(self.folder.glob("*.txt")):
            (self.folder / f"{SAMPLE_NAME}.txt").write_text(SAMPLE_TEXT.strip() + "\n", encoding="utf-8")
        marker.write_text("1", encoding="utf-8")

    def list_sources(self) -> list[Source]:
        sources: list[Source] = []
        for path in self.folder.glob("*.txt"):
            if not path.is_file():
                continue
            try:
                text = normalize(read_text(path))
                modified = datetime.fromtimestamp(path.stat().st_mtime)
                sources.append(Source(path=path, name=path.stem, text=text, modified=modified))
            except OSError as exc:
                sources.append(
                    Source(
                        path=path,
                        name=path.stem,
                        text="",
                        modified=datetime.fromtimestamp(path.stat().st_mtime),
                        error=str(exc),
                    )
                )
        sources.sort(key=lambda item: item.name.lower())
        return sources

    def get(self, filename: str) -> Source | None:
        for source in self.list_sources():
            if source.path.name == filename:
                return source
        return None

    def _unique_path(self, stem: str, ignore: Path | None = None) -> Path:
        ignore_resolved = ignore.resolve() if ignore is not None else None

        def available(candidate: Path) -> bool:
            if ignore_resolved is not None and candidate.exists() and candidate.resolve() == ignore_resolved:
                return True
            return not candidate.exists()

        candidate = self.folder / f"{stem}.txt"
        if available(candidate):
            return candidate
        number = 2
        while True:
            candidate = self.folder / f"{stem} ({number}).txt"
            if available(candidate):
                return candidate
            number += 1

    def name_taken(self, name: str, ignore: Path | None = None) -> bool:
        stem = sanitize_name(name)
        candidate = self.folder / f"{stem}.txt"
        if not candidate.exists():
            return False
        if ignore is not None and candidate.resolve() == ignore.resolve():
            return False
        return True

    def save(self, name: str, text: str, original: Path | None = None) -> Path:
        body = normalize(text)
        if not body:
            raise ValueError("Paste a passage first.")
        stem = sanitize_name(name)
        if not stem:
            raise ValueError("Name this source.")
        if self.name_taken(stem, original):
            raise ValueError("A source with that name already exists.")
        target = self.folder / f"{stem}.txt"
        if original is not None:
            original = original.resolve()
            folder = self.folder.resolve()
            if original.parent != folder:
                raise ValueError("That source is outside the sources folder.")
        target.write_text(body + "\n", encoding="utf-8")
        if original is not None and original != target.resolve() and original.exists():
            original.unlink()
        return target

    def import_file(self, src: Path) -> Path:
        if src.suffix.lower() not in {".txt", ".text", ".md"}:
            raise ValueError("Choose a text file.")
        text = normalize(read_text(src))
        if not text:
            raise ValueError("That file is empty.")
        stem = sanitize_name(src.stem)
        target = self._unique_path(stem)
        target.write_text(text + "\n", encoding="utf-8")
        return target

    def delete(self, path: Path) -> None:
        resolved = path.resolve()
        if resolved.parent != self.folder.resolve():
            raise ValueError("Refusing to delete a file outside the sources folder.")
        resolved.unlink()
