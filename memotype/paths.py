"""Where MemoType keeps sources, scores, and the log on this PC."""

from __future__ import annotations

import ctypes
from pathlib import Path
import sys


def documents_dir() -> Path:
    """The user's Documents folder, including OneDrive Known Folder moves."""
    try:
        buffer = ctypes.create_unicode_buffer(32767)
        result = ctypes.windll.shell32.SHGetFolderPathW(None, 5, None, 0, buffer)
        if result == 0 and buffer.value:
            return Path(buffer.value)
    except Exception:
        pass
    return Path.home() / "Documents"


def data_dir() -> Path:
    root = documents_dir() / "MemoType"
    root.mkdir(parents=True, exist_ok=True)
    return root


def sources_dir() -> Path:
    folder = data_dir() / "sources"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def scores_path() -> Path:
    return data_dir() / "scores.json"


def flash_dir() -> Path:
    folder = data_dir() / "flashcards"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def flash_progress_path() -> Path:
    return flash_dir() / "progress.json"


def flash_samples_dir() -> Path:
    folder = flash_dir() / "samples"
    folder.mkdir(parents=True, exist_ok=True)
    return folder


def log_path() -> Path:
    return data_dir() / "memotype.log"


def resource_path(relative: str) -> Path:
    """A bundled file when frozen, or a project file while developing."""
    if getattr(sys, "frozen", False):
        base = Path(getattr(sys, "_MEIPASS"))
    else:
        base = Path(__file__).resolve().parent.parent
    return base / relative
