"""Per-source high scores kept in a local JSON file."""

from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4

LIMIT = 100


class ScoreStore:
    def __init__(self, path: Path):
        self.path = path

    def _load(self) -> dict:
        if not self.path.exists():
            return {}
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        return data if isinstance(data, dict) else {}

    def _save(self, data: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(json.dumps(data, indent=2), encoding="utf-8")
        temporary.replace(self.path)

    def for_source(self, filename: str) -> list[dict]:
        runs = self._load().get(filename, [])
        if not isinstance(runs, list):
            return []
        return [run for run in runs if isinstance(run, dict)]

    def best(self, filename: str, mode: str | None = None) -> dict | None:
        runs = self.for_source(filename)
        if mode:
            runs = [run for run in runs if run.get("mode") == mode]
        if not runs:
            return None
        return max(runs, key=lambda run: (run.get("score", 0), run.get("wpm", 0)))

    def record(self, filename: str, entry: dict) -> dict:
        data = self._load()
        runs = [run for run in data.get(filename, []) if isinstance(run, dict)]
        previous_scores = [int(run.get("score", 0)) for run in runs]
        previous_best = max(previous_scores) if previous_scores else None
        stored = dict(entry)
        stored["id"] = uuid4().hex
        runs.append(stored)
        runs.sort(key=lambda run: (-float(run.get("score", 0)), -float(run.get("wpm", 0)), float(run.get("seconds", 0))))
        rank = next(index for index, run in enumerate(runs, start=1) if run.get("id") == stored["id"])
        data[filename] = runs[:LIMIT]
        self._save(data)
        score = int(stored.get("score", 0))
        if previous_best is None or score > previous_best:
            standing = "best"
        elif score == previous_best:
            standing = "tie"
        else:
            standing = "ranked"
        return {
            "rank": rank if rank <= LIMIT else None,
            "total": min(len(runs), LIMIT),
            "previous_best": previous_best,
            "standing": standing,
        }

    def rename(self, old_filename: str, new_filename: str) -> None:
        if old_filename == new_filename:
            return
        data = self._load()
        if old_filename not in data:
            return
        existing = data.get(new_filename, [])
        moved = data.pop(old_filename)
        if isinstance(existing, list) and isinstance(moved, list):
            data[new_filename] = existing + moved
        else:
            data[new_filename] = moved
        self._save(data)

    def delete(self, filename: str) -> None:
        data = self._load()
        if filename in data:
            del data[filename]
            self._save(data)
