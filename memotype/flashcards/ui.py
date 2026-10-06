"""Quiz, deck, and progress pages for flashcards."""

from __future__ import annotations

import base64
import io
import time
import tkinter as tk
from tkinter import filedialog

import customtkinter as ctk

from memotype.flashcards.loader import Deck, DeckError, load_builtin, load_json_file, shorten_path
from memotype.flashcards.progress import ProgressStore
from memotype.flashcards.samples import BUILTIN_ID, capitals_path, ensure_samples, write_capitals_file
from memotype.flashcards.session import (
    CHUNKING,
    STANDARD,
    WEIGHTED,
    Session,
    hardest_rows,
)
from memotype.paths import flash_progress_path

BG = "#F4F6F8"
SURFACE = "#FFFFFF"
SURFACE_ALT = "#F8FAFC"
BORDER = "#E6EAF0"
TEXT = "#122033"
MUTED = "#66758A"
FAINT = "#94A3B8"
ACCENT = "#2563EB"
ACCENT_HOVER = "#1D4ED8"
ACCENT_SOFT = "#E8F0FE"
GOOD = "#157F3D"
GOOD_SOFT = "#E7F6EE"
BAD = "#DC2626"
BAD_SOFT = "#FDECEC"
FRAME = "#E7ECF2"
UI = "Segoe UI"

SHORTCUTS = """Enter          Check, or go to the next card
Ctrl+Alt+O     Load a deck file
Ctrl+Alt+Shift+O   Reload the current file
Ctrl+Alt+B     Country capitals
Ctrl+Alt+K     Decks
Ctrl+Alt+G     Quiz
Ctrl+Alt+D     Progress
Ctrl+Alt+1/2/3 Standard, Chunking, Weighted
Ctrl+Alt+[ / ] Chunk size
Ctrl+Alt+T     Swap which side you see
Ctrl+Alt+S     Shuffle
Ctrl+Alt+R     Restart
Ctrl+Alt+C     Check or continue
Ctrl+Alt+N     Next card"""


def _font(size: int, weight: str = "normal") -> ctk.CTkFont:
    return ctk.CTkFont(family=UI, size=size, weight=weight)


def _fit(image, width: int, height: int):
    from PIL import Image

    copy = image.copy()
    copy.thumbnail((width, height), Image.Resampling.LANCZOS)
    return copy


class Flashcards:
    def __init__(self, app):
        self.app = app
        self.progress = ProgressStore(flash_progress_path())
        self.deck: Deck | None = None
        self.session: Session | None = None
        self.error = ""
        self.sticky_correct = False
        self.show_shortcuts = False
        self._advance_id = None
        self._photos: list = []
        self._syncing = False
        ensure_samples()
        self._build()

    def _build(self) -> None:
        content = self.app.content
        self.quiz_page = ctk.CTkFrame(content, fg_color=BG, corner_radius=0)
        self.decks_page = ctk.CTkFrame(content, fg_color=BG, corner_radius=0)
        self.progress_page = ctk.CTkFrame(content, fg_color=BG, corner_radius=0)
        self.pages = (self.quiz_page, self.decks_page, self.progress_page)
        for page in self.pages:
            page.grid_columnconfigure(0, weight=1)
            page.grid_rowconfigure(1, weight=1)
        self._build_quiz()
        self._build_decks()
        self._build_progress()

    def open_default(self) -> None:
        if self.deck is None:
            self.show_decks()
        else:
            self.show_quiz()

    def show_quiz(self) -> None:
        self.app.page = "flash_quiz"
        self.app._mark_nav("flash_quiz")
        self.app._show(self.quiz_page)
        self._render_quiz()
        self._focus_answer()

    def show_decks(self) -> None:
        self.app.page = "flash_decks"
        self.app._mark_nav("flash_decks")
        self.app._show(self.decks_page)
        self._render_decks()

    def show_progress(self) -> None:
        self.app.page = "flash_progress"
        self.app._mark_nav("flash_progress")
        self.app._show(self.progress_page)
        self._render_progress()

    def cancel(self) -> None:
        if self._advance_id is not None:
            try:
                self.app.after_cancel(self._advance_id)
            except tk.TclError:
                pass
            self._advance_id = None

    def on_key(self, event) -> bool:
        control = bool(event.state & 0x4)
        alt = bool(event.state & 0x20000)
        shift = bool(event.state & 0x1)
        key = (event.keysym or "").lower()
        if control and alt:
            return self._shortcut(key, shift)
        if event.keysym in {"Return", "KP_Enter"} and self.app.page == "flash_quiz":
            self._enter()
            return True
        return False

    def _shortcut(self, key: str, shift: bool) -> bool:
        actions = {
            "o": self.reload if shift else self.load_file,
            "b": self.load_capitals,
            "k": self.show_decks,
            "d": self.show_progress,
            "1": lambda: self._set_mode(STANDARD),
            "2": lambda: self._set_mode(CHUNKING),
            "3": lambda: self._set_mode(WEIGHTED),
            "bracketleft": lambda: self._bump_chunk(-1),
            "bracketright": lambda: self._bump_chunk(1),
            "t": self._toggle_side,
            "s": self._toggle_shuffle,
            "r": self._restart,
            "c": self._enter,
            "n": lambda: self._next(manual=True),
            "g": self._open_quiz_if_ready,
        }
        action = actions.get(key)
        if action is None:
            return False
        action()
        return True

    def _open_quiz_if_ready(self) -> None:
        if self.deck is not None:
            self.show_quiz()

    def _set_mode(self, mode: str) -> None:
        if self.session is None:
            return
        self.cancel()
        self.sticky_correct = False
        self.session.set_mode(mode)
        self._sync_settings()
        self._render_quiz()
        if self.app.page == "flash_quiz":
            self._focus_answer()

    def _bump_chunk(self, delta: int) -> None:
        if self.session is None:
            return
        self.cancel()
        self.session.set_chunk_size(self.session.chunk_size + delta)
        self.chunk_entry.delete(0, "end")
        self.chunk_entry.insert(0, str(self.session.chunk_size))
        self._render_quiz()

    def _toggle_side(self) -> None:
        if self.session is None:
            return
        self.cancel()
        self.sticky_correct = False
        self.session.set_start_with_term(not self.session.start_with_term)
        self._clear_answer()
        self._render_quiz()
        self._focus_answer()

    def _toggle_shuffle(self) -> None:
        if self.session is None:
            return
        self.cancel()
        self.sticky_correct = False
        self.session.set_shuffle(not self.session.shuffle)
        self._render_quiz()

    def _restart(self) -> None:
        if self.session is None:
            return
        self.cancel()
        self.sticky_correct = False
        self.error = ""
        self.session.restart()
        self._render_quiz()
        self._focus_answer()

    def load_file(self) -> None:
        chosen = filedialog.askopenfilename(
            parent=self.app,
            title="Load a deck",
            filetypes=[("JSON decks", "*.json"), ("All files", "*.*")],
        )
        if not chosen:
            return
        self._load_path(chosen)

    def reload(self) -> None:
        if self.deck is None or not self.deck.path:
            self.error = "No file is loaded."
            self._render_visible()
            return
        self._load_path(self.deck.path)

    def load_capitals(self) -> None:
        path = capitals_path()
        if not path.exists():
            try:
                write_capitals_file(path)
            except OSError as exc:
                self.error = str(exc)
                self._render_visible()
                return
        try:
            deck = load_builtin("Country capitals", BUILTIN_ID, path)
        except DeckError as exc:
            self.error = str(exc)
            self._render_visible()
            return
        self._use(deck)

    def reset_progress(self) -> None:
        if self.deck is None:
            return
        self.cancel()
        self.progress.reset(self.deck.deck_id)
        self.sticky_correct = False
        self.error = ""
        if self.session is not None:
            self.session.restart()
        self._render_visible()

    def _load_path(self, chosen: str) -> None:
        from pathlib import Path

        try:
            deck = load_json_file(Path(chosen))
        except DeckError as exc:
            self.error = str(exc)
            self._render_visible()
            return
        self._use(deck)

    def _use(self, deck: Deck) -> None:
        self.cancel()
        self.deck = deck
        self.session = Session(deck.deck_id, deck.cards, self.progress)
        self.sticky_correct = False
        self.error = ""
        self._sync_settings()
        self.show_quiz()

    def _build_quiz(self) -> None:
        page = self.quiz_page
        page.grid_rowconfigure(2, weight=1)
        header = ctk.CTkFrame(page, fg_color="transparent")
        header.grid(row=0, column=0, sticky="ew", padx=28, pady=(20, 6))
        self.quiz_title = ctk.CTkLabel(header, text="Quiz", text_color=TEXT, font=_font(28, "bold"))
        self.quiz_title.pack(side="left")
        self.position_label = ctk.CTkLabel(header, text="—", text_color=TEXT, font=_font(16, "bold"))
        self.position_label.pack(side="right")
        self.mistake_label = ctk.CTkLabel(header, text="Mistakes  0", text_color=MUTED, font=_font(14))
        self.mistake_label.pack(side="right", padx=(0, 16))

        settings = ctk.CTkFrame(page, fg_color="transparent")
        settings.grid(row=1, column=0, sticky="ew", padx=28, pady=(0, 8))
        self.mode_switch = ctk.CTkSegmentedButton(
            settings,
            values=["Standard", "Chunking", "Weighted"],
            command=self._mode_changed,
            font=_font(13),
        )
        self.mode_switch.pack(side="left")
        self.mode_switch.set("Standard")
        self.chunk_box = ctk.CTkFrame(settings, fg_color="transparent")
        self.chunk_caption = ctk.CTkLabel(self.chunk_box, text="Chunk", text_color=MUTED, font=_font(13))
        self.chunk_caption.pack(side="left", padx=(0, 6))
        self.chunk_entry = ctk.CTkEntry(self.chunk_box, width=64, height=32, font=_font(14))
        self.chunk_entry.insert(0, "10")
        self.chunk_entry.bind("<Return>", lambda _event: self._commit_chunk())
        self.chunk_entry.pack(side="left")
        self.side_button = ctk.CTkButton(
            settings,
            text="Start: Term -> Type Definition",
            command=self._toggle_side,
            height=32,
            font=_font(13),
            fg_color=SURFACE,
            text_color=TEXT,
            border_width=1,
            border_color=BORDER,
            hover_color=SURFACE_ALT,
        )
        self.side_button.pack(side="left", padx=(8, 0))
        self.shuffle_button = ctk.CTkButton(
            settings,
            text="Shuffle: Off",
            command=self._toggle_shuffle,
            height=32,
            font=_font(13),
            fg_color=SURFACE,
            text_color=TEXT,
            border_width=1,
            border_color=BORDER,
            hover_color=SURFACE_ALT,
        )
        self.shuffle_button.pack(side="left", padx=8)
        ctk.CTkButton(
            settings,
            text="Restart",
            command=self._restart,
            height=32,
            font=_font(13),
            fg_color=SURFACE,
            text_color=TEXT,
            border_width=1,
            border_color=BORDER,
            hover_color=SURFACE_ALT,
        ).pack(side="left")

        # The prompt card and the answer strip stay a fixed height.
        # Feedback is placed in the space below, so it cannot push them.
        page.grid_rowconfigure(1, weight=0)
        page.grid_rowconfigure(2, weight=1)
        stage = ctk.CTkFrame(page, fg_color="transparent")
        stage.grid(row=2, column=0, sticky="nsew", padx=36, pady=(0, 8))
        stage.grid_columnconfigure(0, weight=1)
        stage.grid_rowconfigure(0, weight=1)
        stage.grid_rowconfigure(3, weight=1)

        prompt = ctk.CTkFrame(
            stage,
            fg_color=SURFACE,
            corner_radius=16,
            border_width=1,
            border_color=BORDER,
            height=340,
        )
        prompt.grid(row=1, column=0, sticky="ew")
        prompt.grid_propagate(False)
        prompt.grid_columnconfigure(0, weight=1)
        self.side_label = ctk.CTkLabel(prompt, text="TERM", text_color=MUTED, font=_font(12, "bold"))
        self.side_label.grid(row=0, column=0, sticky="w", padx=22, pady=(16, 0))
        self.image_canvas = tk.Canvas(prompt, width=360, height=210, bg=FRAME, highlightthickness=0)
        self.prompt_label = ctk.CTkLabel(
            prompt,
            text="Load a deck to begin.",
            text_color=TEXT,
            font=_font(28, "bold"),
            wraplength=720,
            justify="center",
        )
        self.prompt_label.place(relx=0.5, rely=0.55, anchor="center")

        answer = ctk.CTkFrame(
            stage,
            fg_color=SURFACE,
            corner_radius=16,
            border_width=1,
            border_color=BORDER,
            height=128,
        )
        answer.grid(row=2, column=0, sticky="ew", pady=(12, 0))
        answer.pack_propagate(False)
        self.answer_caption = ctk.CTkLabel(answer, text="Type the definition", text_color=MUTED, font=_font(13), anchor="w")
        self.answer_caption.pack(fill="x", padx=18, pady=(14, 6))
        self.entry = ctk.CTkEntry(answer, height=42, font=_font(16), placeholder_text="Type your answer and press Enter...")
        self.entry.pack(fill="x", padx=18)
        self.entry.bind("<KeyRelease>", lambda _event: self._refresh_next_state())
        buttons = ctk.CTkFrame(answer, fg_color="transparent")
        buttons.pack(fill="x", padx=18, pady=(10, 0))
        self.check_button = ctk.CTkButton(
            buttons,
            text="Check",
            command=self._check,
            height=36,
            font=_font(14, "bold"),
            fg_color=ACCENT,
            hover_color=ACCENT_HOVER,
        )
        self.check_button.pack(side="left")
        self.next_button = ctk.CTkButton(
            buttons,
            text="Next",
            command=lambda: self._next(manual=True),
            height=36,
            font=_font(14),
            fg_color=SURFACE,
            text_color=TEXT,
            border_width=1,
            border_color=BORDER,
            hover_color=SURFACE_ALT,
        )
        self.next_button.pack(side="left", padx=8)

        self.feedback = ctk.CTkFrame(stage, fg_color="transparent", height=1)
        self.feedback.grid(row=3, column=0, sticky="nsew", pady=(12, 0))
        self.feedback.pack_propagate(False)
        self.feedback_stack = ctk.CTkFrame(self.feedback, fg_color="transparent")
        self.feedback_stack.place(relx=0, rely=0, relwidth=1, anchor="nw")
        self.card_mistakes = ctk.CTkLabel(self.feedback_stack, text="", text_color=BAD, font=_font(13), anchor="w")
        self.quiz_error = ctk.CTkLabel(
            self.feedback_stack,
            text="",
            text_color=BAD,
            font=_font(13),
            anchor="w",
            justify="left",
            wraplength=720,
        )
        self.result_box = ctk.CTkFrame(self.feedback_stack, fg_color=GOOD_SOFT, corner_radius=12)
        self.result_title = ctk.CTkLabel(self.result_box, text="", text_color=GOOD, font=_font(16, "bold"), anchor="w")
        self.result_title.pack(fill="x", padx=12, pady=(10, 2))
        self.result_body = ctk.CTkLabel(
            self.result_box,
            text="",
            text_color=TEXT,
            font=("Consolas", 14),
            anchor="w",
            justify="left",
            wraplength=720,
        )
        self.result_body.pack(fill="x", padx=12, pady=(0, 4))
        self.reveal_canvas = tk.Canvas(self.result_box, width=220, height=120, bg=FRAME, highlightthickness=0)
        self.result_hint = ctk.CTkLabel(self.result_box, text="", text_color=MUTED, font=_font(12), anchor="w")
        self.result_hint.pack(fill="x", padx=12, pady=(0, 10))
        self.shortcut_box = ctk.CTkLabel(
            self.feedback_stack,
            text=SHORTCUTS,
            text_color=MUTED,
            font=("Consolas", 11),
            anchor="w",
            justify="left",
        )

        foot = ctk.CTkFrame(page, fg_color="transparent")
        foot.grid(row=3, column=0, sticky="ew", padx=28, pady=(0, 16))
        ctk.CTkButton(
            foot,
            text="Decks",
            command=self.show_decks,
            height=34,
            font=_font(13),
            fg_color=SURFACE,
            text_color=TEXT,
            border_width=1,
            border_color=BORDER,
            hover_color=SURFACE_ALT,
        ).pack(side="left")

    def _build_decks(self) -> None:
        page = self.decks_page
        wrap = ctk.CTkFrame(page, fg_color="transparent")
        wrap.grid(row=0, column=0, sticky="ew", padx=36, pady=(24, 0))
        ctk.CTkLabel(wrap, text="Decks", text_color=TEXT, font=_font(28, "bold")).pack(anchor="w")
        self.deck_status = ctk.CTkLabel(wrap, text="No deck loaded", text_color=MUTED, font=_font(14), anchor="w")
        self.deck_status.pack(anchor="w", pady=(8, 0))
        self.deck_path = ctk.CTkLabel(wrap, text="", text_color=FAINT, font=_font(12), anchor="w")
        self.deck_path.pack(anchor="w")
        self.deck_totals = ctk.CTkLabel(wrap, text="", text_color=TEXT, font=_font(14), anchor="w")
        self.deck_totals.pack(anchor="w", pady=(8, 0))
        self.deck_error = ctk.CTkLabel(wrap, text="", text_color=BAD, font=_font(13), anchor="w", justify="left", wraplength=640)
        self.deck_error.pack(anchor="w", pady=(8, 0))

        buttons = ctk.CTkFrame(page, fg_color="transparent")
        buttons.grid(row=1, column=0, sticky="nw", padx=36, pady=16)
        self.load_button = ctk.CTkButton(
            buttons,
            text="Load cards file",
            command=self.load_file,
            height=40,
            font=_font(14, "bold"),
            fg_color=ACCENT,
            hover_color=ACCENT_HOVER,
        )
        self.load_button.pack(anchor="w", pady=4)
        self.reload_button = ctk.CTkButton(
            buttons,
            text="Reload",
            command=self.reload,
            height=36,
            font=_font(13),
            fg_color=SURFACE,
            text_color=TEXT,
            border_width=1,
            border_color=BORDER,
            hover_color=SURFACE_ALT,
        )
        self.reload_button.pack(anchor="w", pady=4)
        ctk.CTkButton(
            buttons,
            text="Load built-in: Country capitals",
            command=self.load_capitals,
            height=36,
            font=_font(13),
            fg_color=SURFACE,
            text_color=TEXT,
            border_width=1,
            border_color=BORDER,
            hover_color=SURFACE_ALT,
        ).pack(anchor="w", pady=4)
        self.reset_button = ctk.CTkButton(
            buttons,
            text="Reset progress",
            command=self.reset_progress,
            height=36,
            font=_font(13),
            fg_color=SURFACE,
            text_color=BAD,
            border_width=1,
            border_color=BORDER,
            hover_color=BAD_SOFT,
        )
        self.reset_button.pack(anchor="w", pady=4)
        ctk.CTkButton(
            buttons,
            text="Shortcuts",
            command=self._toggle_shortcuts,
            height=36,
            font=_font(13),
            fg_color=SURFACE,
            text_color=TEXT,
            border_width=1,
            border_color=BORDER,
            hover_color=SURFACE_ALT,
        ).pack(anchor="w", pady=(16, 4))
        ctk.CTkLabel(
            buttons,
            text="Sample decks are in the flashcards samples folder.",
            text_color=MUTED,
            font=_font(13),
            anchor="w",
        ).pack(anchor="w", pady=(12, 0))

    def _build_progress(self) -> None:
        page = self.progress_page
        page.grid_rowconfigure(1, weight=1)
        header = ctk.CTkFrame(page, fg_color="transparent")
        header.grid(row=0, column=0, sticky="ew", padx=28, pady=(24, 8))
        ctk.CTkLabel(header, text="Progress", text_color=TEXT, font=_font(28, "bold")).pack(side="left")
        ctk.CTkButton(
            header,
            text="Reset",
            command=self.reset_progress,
            height=34,
            font=_font(13),
            fg_color=SURFACE,
            text_color=BAD,
            border_width=1,
            border_color=BORDER,
            hover_color=BAD_SOFT,
        ).pack(side="right")
        self.progress_subtitle = ctk.CTkLabel(header, text="", text_color=MUTED, font=_font(13), anchor="w")
        self.progress_subtitle.pack(side="left", padx=(16, 0))
        self.progress_stats = ctk.CTkFrame(page, fg_color="transparent")
        self.progress_stats.grid(row=1, column=0, sticky="new", padx=28)
        self.accuracy_value = self._stat(self.progress_stats, "Accuracy")
        self.correct_value = self._stat(self.progress_stats, "Correct")
        self.errors_value = self._stat(self.progress_stats, "Errors")
        self.progress_table = ctk.CTkScrollableFrame(page, fg_color=SURFACE, corner_radius=16, border_width=1, border_color=BORDER)
        self.progress_table.grid(row=2, column=0, sticky="nsew", padx=28, pady=(8, 24))
        page.grid_rowconfigure(2, weight=1)

    def _stat(self, parent, caption: str) -> ctk.CTkLabel:
        chip = ctk.CTkFrame(parent, fg_color=SURFACE, corner_radius=12, border_width=1, border_color=BORDER)
        chip.pack(side="left", padx=(0, 8), pady=8)
        ctk.CTkLabel(chip, text=caption, text_color=MUTED, font=_font(11)).pack(anchor="w", padx=12, pady=(6, 0))
        value = ctk.CTkLabel(chip, text="—", text_color=TEXT, font=_font(18, "bold"))
        value.pack(anchor="w", padx=12, pady=(0, 6))
        return value

    def _mode_changed(self, value: str) -> None:
        if self._syncing or self.session is None:
            return
        self._set_mode({"Standard": STANDARD, "Chunking": CHUNKING, "Weighted": WEIGHTED}[value])

    def _commit_chunk(self) -> None:
        if self.session is None:
            return
        raw = self.chunk_entry.get().strip()
        if not raw.isdigit() or int(raw) < 1:
            self.chunk_entry.delete(0, "end")
            self.chunk_entry.insert(0, str(self.session.chunk_size))
            return
        size = int(raw)
        if size != self.session.chunk_size:
            self.cancel()
            self.session.set_chunk_size(size)
            self._render_quiz()

    def _toggle_shortcuts(self) -> None:
        self.show_shortcuts = not self.show_shortcuts
        self._render_quiz()

    def _enter(self) -> None:
        if self.session is None or self.app.page != "flash_quiz":
            return
        if not self.session.checked:
            self._check()
        else:
            self._next(manual=True)

    def _check(self) -> None:
        if self.session is None or self.session.checked:
            return
        self.error = ""
        self.sticky_correct = False
        outcome = self.session.check(self.entry.get(), int(time.time() * 1000))
        if outcome == "correct":
            self._schedule_advance()
        else:
            self.cancel()
            self._clear_answer()
        self._render_quiz()
        self._render_progress()
        self._focus_answer()

    def _next(self, manual: bool) -> None:
        if self.session is None or not self.session.checked:
            return
        typed = self.entry.get()
        if self.session.correction_required and not self.session.matches(typed):
            self.error = "Type the expected answer to continue."
            self._render_quiz()
            return
        self.cancel()
        self.session.advance(typed)
        self.sticky_correct = False
        self.error = ""
        self._clear_answer()
        self._render_quiz()
        self._focus_answer()

    def _schedule_advance(self) -> None:
        self.cancel()
        self._advance_id = self.app.after(350, self._auto_advance)

    def _auto_advance(self) -> None:
        self._advance_id = None
        if self.session is None or not self.session.checked or not self.session.was_correct:
            return
        self.session.advance("")
        self.sticky_correct = True
        self._clear_answer()
        self._render_quiz()
        self._focus_answer()

    def _focus_answer(self) -> None:
        if self.app.page != "flash_quiz":
            return
        if str(self.entry.cget("state")) != "disabled":
            self.entry.focus_set()

    def _sync_settings(self) -> None:
        if self.session is None:
            return
        self._syncing = True
        names = {STANDARD: "Standard", CHUNKING: "Chunking", WEIGHTED: "Weighted"}
        self.mode_switch.set(names[self.session.mode])
        self._syncing = False
        self.chunk_entry.delete(0, "end")
        self.chunk_entry.insert(0, str(self.session.chunk_size))

    def _render_visible(self) -> None:
        if self.app.page == "flash_quiz":
            self._render_quiz()
        elif self.app.page == "flash_decks":
            self._render_decks()
        elif self.app.page == "flash_progress":
            self._render_progress()

    def _render_quiz(self) -> None:
        session = self.session
        self.quiz_error.configure(text=self.error)
        if session is None:
            self.quiz_title.configure(text="Quiz")
            self.position_label.configure(text="—")
            self.mistake_label.configure(text="Mistakes  0")
            self.side_label.configure(text="")
            self.prompt_label.configure(text="Load a deck to begin.")
            self.prompt_label.place(relx=0.5, rely=0.55, anchor="center")
            self.image_canvas.place_forget()
            self.answer_caption.configure(text="Type the definition")
            self.entry.configure(state="disabled", placeholder_text="")
            self.check_button.configure(state="disabled")
            self.next_button.configure(state="disabled", text="Next")
            self.result_box.pack_forget()
            self.card_mistakes.pack_forget()
            self.quiz_error.pack_forget()
            self.shortcut_box.pack_forget()
            return
        card = session.current_card()
        self.quiz_title.configure(text=self.deck.name if self.deck else "Quiz")
        self.position_label.configure(text=session.position_label())
        self.mistake_label.configure(text=f"Mistakes  {session.session_mistakes}")
        self.side_label.configure(text="TERM" if session.showing_term() else "DEFINITION")
        prompt = session.prompt_text()
        self.prompt_label.configure(text=prompt or "")
        image = session.prompt_image()
        if image:
            self.image_canvas.place(relx=0.5, rely=0.46, anchor="center")
            self.prompt_label.place(relx=0.5, rely=0.9, anchor="center")
            self._draw_image(self.image_canvas, image, 360, 210)
        else:
            self.image_canvas.place_forget()
            self.prompt_label.place(relx=0.5, rely=0.55, anchor="center")
        self.answer_caption.configure(text="Type the definition" if session.showing_term() else "Type the term")
        self.side_button.configure(
            text="Start: Term -> Type Definition" if session.start_with_term else "Start: Definition -> Type Term"
        )
        self.shuffle_button.configure(
            text="Shuffle: On" if session.shuffle else "Shuffle: Off",
            border_color=ACCENT if session.shuffle else BORDER,
        )
        if session.mode == CHUNKING:
            if not self.chunk_box.winfo_ismapped():
                self.chunk_box.pack(side="left", padx=(8, 0), after=self.mode_switch)
        else:
            self.chunk_box.pack_forget()
        misses = session.card_mistakes.get(session.current_index(), 0)
        if misses:
            self.card_mistakes.configure(text=f"Mistakes on this card: {misses}")
            self.card_mistakes.pack(fill="x", pady=(0, 6))
        else:
            self.card_mistakes.pack_forget()
        if self.error:
            self.quiz_error.pack(fill="x", pady=(0, 6))
        else:
            self.quiz_error.pack_forget()
        finish = session.mode == STANDARD and session.cursor >= len(session.order) - 1
        self.next_button.configure(text="Finish" if finish else "Next")
        if not session.checked:
            self._ready_answer("Type your answer and press Enter...")
            self.check_button.configure(state="normal")
            self.next_button.configure(state="disabled")
            if not self.sticky_correct:
                self.result_box.pack_forget()
            else:
                self._show_result(correct=True, expected="", image="")
        elif session.was_correct:
            self.entry.configure(state="disabled")
            self.check_button.configure(state="disabled")
            self.next_button.configure(state="normal")
            self._show_result(correct=True, expected="", image="")
        else:
            self._ready_answer("Type your answer and press Enter...")
            self.check_button.configure(state="disabled")
            self._refresh_next_state()
            reveal = card.image if (not session.showing_term() and card.image) else ""
            self._show_result(correct=False, expected=session.expected_text(), image=reveal)
        if self.show_shortcuts:
            self.shortcut_box.pack(fill="x", pady=(12, 0))
        else:
            self.shortcut_box.pack_forget()

    def _clear_answer(self) -> None:
        # A disabled entry ignores delete, so the correct answer stayed
        # in the box after the card advanced.
        self.entry.configure(state="normal")
        self.entry._deactivate_placeholder()
        self.entry.delete(0, "end")

    def _ready_answer(self, placeholder: str) -> None:
        # Changing placeholder_text on a focused CTkEntry writes the hint into
        # the box as real text, and focus-in does not fire again to clear it.
        self.entry.configure(state="normal", placeholder_text=placeholder)
        if self.entry._is_focused:
            self.entry._deactivate_placeholder()

    def _refresh_next_state(self) -> None:
        session = self.session
        if session is None or not session.checked:
            return
        if session.correction_required and not session.matches(self.entry.get()):
            self.next_button.configure(state="disabled")
        else:
            self.next_button.configure(state="normal")

    def _show_result(self, correct: bool, expected: str, image: str) -> None:
        self.result_box.configure(fg_color=GOOD_SOFT if correct else BAD_SOFT)
        self.result_title.configure(text="Correct" if correct else "Not quite", text_color=GOOD if correct else BAD)
        self.result_body.configure(text="" if correct else f"Expected: {expected}")
        if image and not correct:
            self.reveal_canvas.pack(padx=12, pady=(0, 8))
            self._draw_image(self.reveal_canvas, image, 220, 120)
        else:
            self.reveal_canvas.pack_forget()
        self.result_hint.configure(text="" if correct else "Type the expected answer to continue.")
        self.result_box.pack(fill="x", pady=(0, 8))

    def _draw_image(self, canvas: tk.Canvas, uri: str, width: int, height: int) -> None:
        from PIL import Image, ImageTk

        canvas.delete("all")
        canvas.configure(width=width, height=height, bg=FRAME)
        image = _decode(uri)
        if image is None:
            canvas.create_text(width / 2, height / 2, text="Image", fill=MUTED, font=(UI, 14))
            return
        fitted = _fit(image, width - 16, height - 16)
        photo = ImageTk.PhotoImage(fitted)
        self._photos.append(photo)
        self._photos = self._photos[-8:]
        canvas.create_image(width / 2, height / 2, image=photo)
        canvas._photo = photo  # type: ignore[attr-defined]

    def _render_decks(self) -> None:
        if self.deck is None:
            self.deck_status.configure(text="No deck loaded", text_color=BAD)
            self.deck_path.configure(text="")
            self.deck_totals.configure(text="")
            self.load_button.configure(text="Load cards file")
            self.reload_button.configure(state="disabled")
            self.reset_button.configure(state="disabled")
        else:
            label = "Built-in" if self.deck.path is None else "Loaded"
            shown = "Country capitals" if self.deck.path is None else shorten_path(self.deck.path)
            correct, errors = self.progress.totals(self.deck.deck_id)
            self.deck_status.configure(text=label, text_color=GOOD)
            self.deck_path.configure(text=shown)
            self.deck_totals.configure(text=f"Correct: {correct}    Errors: {errors}")
            self.load_button.configure(text="Load different file")
            self.reload_button.configure(state="normal" if self.deck.path else "disabled")
            self.reset_button.configure(state="normal")
        self.deck_error.configure(text=self.error)

    def _render_progress(self) -> None:
        for child in self.progress_table.winfo_children():
            child.destroy()
        if self.deck is None or self.session is None:
            self.progress_subtitle.configure(text="Load a deck to see progress.")
            self.accuracy_value.configure(text="—")
            self.correct_value.configure(text="—")
            self.errors_value.configure(text="—")
            ctk.CTkLabel(self.progress_table, text="Load a deck to see progress.", text_color=MUTED, font=_font(14)).pack(
                anchor="w", padx=16, pady=16
            )
            return
        correct, errors = self.progress.totals(self.deck.deck_id)
        attempts = correct + errors
        accuracy = 0 if attempts == 0 else round(correct / attempts * 100)
        self.progress_subtitle.configure(text=self.deck.deck_id)
        self.accuracy_value.configure(text=f"{accuracy}%")
        self.correct_value.configure(text=str(correct))
        self.errors_value.configure(text=str(errors))
        rows = hardest_rows(self.session.cards, self.progress, self.deck.deck_id)
        ctk.CTkLabel(self.progress_table, text="Hardest cards", text_color=TEXT, font=_font(16, "bold")).pack(anchor="w", padx=16, pady=(12, 6))
        if not rows:
            ctk.CTkLabel(self.progress_table, text="No stats yet. Start practicing.", text_color=MUTED, font=_font(14)).pack(
                anchor="w", padx=16, pady=8
            )
            return
        for row in rows:
            term = _clip(row["term"], 22)
            definition = _clip(row["definition"], 22)
            percent = round(row["accuracy"] * 100)
            line = f"{row['index']:>3}   {term:<22}  {definition:<22}   E {row['e']:<3} C {row['c']:<3} {percent:>3}%   W {row['weight']}"
            ctk.CTkLabel(self.progress_table, text=line, text_color=TEXT, font=("Consolas", 12), anchor="w").pack(fill="x", padx=16, pady=2)


def _clip(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 1] + "…"


def _decode(uri: str):
    from PIL import Image

    try:
        if uri.startswith("data:image/"):
            if "svg" in uri.split(",", 1)[0]:
                return None
            payload = uri.split(",", 1)[1]
            return Image.open(io.BytesIO(base64.b64decode(payload))).convert("RGBA")
    except Exception:
        return None
    return None
