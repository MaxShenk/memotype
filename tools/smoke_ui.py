"""Open MemoType, exercise both modes, and save screenshots."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from PIL import ImageGrab

from memotype.app import MemoTypeApp
from memotype.engine import PRACTICE, RECALL

OUT = Path(__file__).resolve().parents[1] / ".smoke"
OUT.mkdir(exist_ok=True)


def shot(app: MemoTypeApp, name: str) -> None:
    import time

    app.update_idletasks()
    time.sleep(0.08)
    app.update()
    app.lift()
    app.attributes("-topmost", True)
    app.update()
    x, y = app.winfo_rootx(), app.winfo_rooty()
    image = ImageGrab.grab(bbox=(x, y, x + app.winfo_width(), y + app.winfo_height()))
    image.save(OUT / name)
    print(name, image.size)


def key(app: MemoTypeApp, char: str, keysym: str | None = None, state: int = 0) -> None:
    app._on_key(SimpleNamespace(char=char, keysym=keysym or char, state=state))
    app.update()


def main() -> None:
    app = MemoTypeApp()
    app.update()
    assert app.selected is not None, "library should select a source"
    shot(app, "01-library.png")

    source = app.selected
    app.show_creator()
    app.update()
    shot(app, "02-creator.png")
    app.editor_snapshot = (app.name_entry.get().strip(), app.editor_box.get("1.0", "end-1c"))
    app.show_library()

    app.show_game(source, PRACTICE)
    app.update()
    first = source.text[0]
    key(app, first, state=0x8)  # Num Lock is held on Windows and must not block typing
    key(app, "!")
    shot(app, "03-practice.png")
    assert app.engine is not None
    assert app.engine.mistakes == 1
    assert app.engine.pos == 1
    assert app.stat_wpm.cget("text") == "—"
    assert app.stat_progress.cget("text") == "<1%"
    app.engine.started_at = None
    app.page = "library"
    app.show_game(source, RECALL)
    app.update()
    key(app, "!")
    assert app.engine.visible_text() == ""
    key(app, "\x12", "r", 0x4)
    assert app.engine.revealed
    assert app.engine.current_word
    shown = app.passage.get("1.0", "end-1c")
    assert "\u2003" in shown
    assert "Type the revealed word." in shown
    key(app, "M")
    shown = app.passage.get("1.0", "end-1c")
    assert shown.startswith("M\u2003")
    shot(app, "04-recall.png")
    app.engine.started_at = None
    app.page = "library"
    path = app.sources.save("Smoke Check", "Go.")
    app.selected = app.sources.get(path.name)
    tiny = app.selected
    assert tiny is not None
    app.page = "library"
    app.show_game(tiny, PRACTICE)
    for ch in "Go.":
        key(app, ch)
    assert app.engine is not None and app.engine.finished
    assert app.engine.score == 3
    app.show_scores()
    app.update()
    shot(app, "05-scores.png")
    app.sources.delete(path)
    app.scores.delete(path.name)
    app.destroy()
    print("smoke ok")


if __name__ == "__main__":
    main()
