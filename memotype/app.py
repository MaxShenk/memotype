"""Light desktop window for MemoType."""

from __future__ import annotations

import logging
import os
import tkinter as tk
from datetime import datetime
from pathlib import Path
from tkinter import filedialog, messagebox

import customtkinter as ctk

from memotype import __version__
from memotype.engine import PRACTICE, RECALL, Engine
from memotype.flashcards.samples import ensure_samples
from memotype.flashcards.ui import Flashcards
from memotype.paths import resource_path, scores_path, sources_dir
from memotype.scores import ScoreStore
from memotype.sources import Source, SourceStore

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
WARN = "#C2410C"
WARN_SOFT = "#FFF4EC"

PASSAGE = ("Georgia", 22)
CURSOR = "\u2003"
UI = "Segoe UI"


def _font(size: int, weight: str = "normal") -> ctk.CTkFont:
    return ctk.CTkFont(family=UI, size=size, weight=weight)


def format_time(seconds: float) -> str:
    seconds = max(0.0, seconds)
    minutes = int(seconds // 60)
    remain = seconds - minutes * 60
    return f"{minutes}:{remain:04.1f}"


def format_when(iso: str) -> str:
    try:
        moment = datetime.fromisoformat(iso)
    except ValueError:
        return iso
    hour = moment.strftime("%I").lstrip("0") or "12"
    return f"{moment.strftime('%b')} {moment.day}, {hour}:{moment.strftime('%M')} {moment.strftime('%p')}"


class MemoTypeApp(ctk.CTk):
    def __init__(self):
        ctk.set_appearance_mode("light")
        ctk.set_default_color_theme("blue")
        super().__init__()
        self.title("MemoType")
        self.configure(fg_color=BG)
        self.minsize(1024, 680)
        self.tool = "typing"
        self.sources = SourceStore(sources_dir())
        self.sources.ensure_ready()
        self.scores = ScoreStore(scores_path())
        self.page = "library"
        self.selected: Source | None = None
        self.editor_original: Source | None = None
        self.editor_snapshot = ("", "")
        self.engine: Engine | None = None
        self.game_source: Source | None = None
        self._tick_id = None
        self._flash_id = None
        self._cursor_id = None
        self._cursor_on = True
        self._alert = False
        self._clock = self._monotonic

        self.grid_columnconfigure(2, weight=1)
        self.grid_rowconfigure(0, weight=1)
        self._build_sidebar()
        ctk.CTkFrame(self, width=1, fg_color=BORDER, corner_radius=0).grid(row=0, column=1, sticky="ns")
        self.content = ctk.CTkFrame(self, fg_color=BG, corner_radius=0)
        self.content.grid(row=0, column=2, sticky="nsew")
        self.content.grid_columnconfigure(0, weight=1)
        self.content.grid_rowconfigure(0, weight=1)

        self.library_page = ctk.CTkFrame(self.content, fg_color=BG, corner_radius=0)
        self.creator_page = ctk.CTkFrame(self.content, fg_color=BG, corner_radius=0)
        self.game_page = ctk.CTkFrame(self.content, fg_color=BG, corner_radius=0)
        self.scores_page = ctk.CTkFrame(self.content, fg_color=BG, corner_radius=0)
        for page in (self.library_page, self.creator_page, self.game_page, self.scores_page):
            page.grid_columnconfigure(0, weight=1)

        self._build_library()
        self._build_creator()
        self._build_game()
        self._build_scores()
        self.flash = Flashcards(self)
        self._rebuild_nav()
        self.bind("<KeyPress>", self._on_key)
        self._place_window()
        self._apply_icon()
        self.show_library()
        self.after(200, self._light_titlebar)

    def _monotonic(self) -> float:
        import time

        return time.monotonic()

    def _place_window(self) -> None:
        width, height = 1120, 760
        self.update_idletasks()
        x = max(0, (self.winfo_screenwidth() - width) // 2)
        y = max(0, (self.winfo_screenheight() - height) // 2)
        self.geometry(f"{width}x{height}+{x}+{y}")

    def _apply_icon(self) -> None:
        icon = resource_path("assets/icon.ico")
        if icon.exists():
            try:
                self.iconbitmap(str(icon))
            except tk.TclError:
                logging.exception("icon")

    def _light_titlebar(self) -> None:
        try:
            import ctypes

            self.update_idletasks()
            hwnd = ctypes.windll.user32.GetParent(self.winfo_id())
            value = ctypes.c_int(0)
            ctypes.windll.dwmapi.DwmSetWindowAttribute(hwnd, 20, ctypes.byref(value), ctypes.sizeof(value))
        except Exception:
            logging.debug("title bar color left to Windows", exc_info=True)

    def _build_sidebar(self) -> None:
        bar = ctk.CTkFrame(self, width=248, fg_color=SURFACE, corner_radius=0)
        bar.grid(row=0, column=0, sticky="ns")
        bar.grid_propagate(False)
        bar.grid_rowconfigure(2, weight=1)
        bar.grid_columnconfigure(0, weight=1)

        brand = ctk.CTkFrame(bar, fg_color="transparent")
        brand.grid(row=0, column=0, sticky="ew", padx=20, pady=(22, 8))
        mark = ctk.CTkFrame(brand, width=36, height=36, corner_radius=10, fg_color=ACCENT)
        mark.grid(row=0, column=0, rowspan=2, padx=(0, 12))
        mark.grid_propagate(False)
        ctk.CTkLabel(mark, text="M", text_color="white", font=_font(18, "bold")).place(relx=0.5, rely=0.5, anchor="center")
        ctk.CTkLabel(brand, text="MemoType", text_color=TEXT, font=_font(18, "bold"), anchor="w").grid(row=0, column=1, sticky="w")
        ctk.CTkLabel(brand, text="Typing and flashcards", text_color=MUTED, font=_font(12), anchor="w").grid(row=1, column=1, sticky="w")

        self.tool_switch = ctk.CTkSegmentedButton(
            bar,
            values=["Typing", "Flashcards"],
            command=self._set_tool,
            font=_font(13),
        )
        self.tool_switch.grid(row=1, column=0, sticky="ew", padx=16, pady=(4, 8))
        self.tool_switch.set("Typing")

        self.nav = ctk.CTkFrame(bar, fg_color="transparent")
        self.nav.grid(row=2, column=0, sticky="new", padx=12)
        self.nav_buttons = {}

        foot = ctk.CTkFrame(bar, fg_color="transparent")
        foot.grid(row=3, column=0, sticky="sew", padx=16, pady=16)
        self.folder_button = ctk.CTkButton(
            foot,
            text="Open sources folder",
            command=self._open_folder,
            height=36,
            corner_radius=8,
            font=_font(13),
            fg_color=SURFACE,
            text_color=TEXT,
            border_width=1,
            border_color=BORDER,
            hover_color=SURFACE_ALT,
        )
        self.folder_button.pack(fill="x")
        folder_label = self.sources.folder.name
        parent_label = self.sources.folder.parent.name
        self.folder_caption = ctk.CTkLabel(
            foot,
            text=f"{parent_label}\\{folder_label}",
            text_color=FAINT,
            font=_font(11),
            wraplength=210,
            justify="left",
            anchor="w",
        )
        self.folder_caption.pack(fill="x", pady=(10, 4))
        ctk.CTkLabel(foot, text=f"v{__version__}", text_color=FAINT, font=_font(11), anchor="w").pack(fill="x")

    def _all_pages(self) -> tuple:
        pages = [self.library_page, self.creator_page, self.game_page, self.scores_page]
        flash = getattr(self, "flash", None)
        if flash is not None:
            pages.extend(flash.pages)
        return tuple(pages)

    def _rebuild_nav(self) -> None:
        for child in self.nav.winfo_children():
            child.destroy()
        self.nav_buttons = {}
        if self.tool == "flashcards":
            items = (
                ("flash_quiz", "Quiz", self.flash.show_quiz),
                ("flash_decks", "Decks", self.flash.show_decks),
                ("flash_progress", "Progress", self.flash.show_progress),
            )
        else:
            items = (
                ("library", "Library", self.show_library),
                ("creator", "New source", self.show_creator),
                ("scores", "High scores", self.show_scores),
            )
        for key, label, command in items:
            button = ctk.CTkButton(
                self.nav,
                text=label,
                command=command,
                height=40,
                anchor="w",
                corner_radius=8,
                font=_font(14),
                fg_color="transparent",
                text_color=TEXT,
                hover_color=SURFACE_ALT,
            )
            button.pack(fill="x", pady=2)
            self.nav_buttons[key] = button

    def _set_tool(self, value: str) -> None:
        target = "flashcards" if value == "Flashcards" else "typing"
        if target == self.tool:
            return
        if not self._guard():
            self.tool_switch.set("Flashcards" if self.tool == "flashcards" else "Typing")
            return
        self.tool = target
        self.page = "switching"
        self._rebuild_nav()
        self._update_folder()
        if target == "flashcards":
            self.flash.open_default()
        else:
            self.show_library()

    def _update_folder(self) -> None:
        if self.tool == "flashcards":
            self.folder_button.configure(text="Open samples folder")
            self.folder_caption.configure(text="flashcards\\samples")
        else:
            self.folder_button.configure(text="Open sources folder")
            self.folder_caption.configure(text=f"{self.sources.folder.parent.name}\\{self.sources.folder.name}")

    def _mark_nav(self, page: str) -> None:
        for key, button in self.nav_buttons.items():
            active = key == page
            button.configure(
                fg_color=ACCENT_SOFT if active else "transparent",
                text_color=ACCENT if active else TEXT,
                font=_font(14, "bold" if active else "normal"),
            )

    def _show(self, frame: ctk.CTkFrame) -> None:
        for page in self._all_pages():
            page.grid_remove()
        frame.grid(row=0, column=0, sticky="nsew")

    def _run_in_progress(self) -> bool:
        return self.page == "game" and self.engine is not None and self.engine.started_at is not None and not self.engine.finished

    def _confirm_leave(self) -> bool:
        return messagebox.askyesno("Leave this run?", "This run will not be saved.", parent=self)

    def _guard(self) -> bool:
        if self.page == "creator" and self._editor_dirty():
            if not messagebox.askyesno("Discard changes?", "This source has not been saved.", parent=self):
                return False
            self.editor_snapshot = (self.name_entry.get().strip(), self.editor_box.get("1.0", "end-1c"))
        if self._run_in_progress() and not self._confirm_leave():
            return False
        self._stop_tick()
        return True

    def show_library(self) -> None:
        if self.page != "library" and not self._guard():
            return
        self.page = "library"
        self._mark_nav("library")
        self._refresh_library()
        self._show(self.library_page)
        self.focus_set()

    def show_creator(self, source: Source | None = None) -> None:
        if not self._guard():
            return
        self.page = "creator"
        self._mark_nav("creator")
        self.editor_original = source
        name = source.name if source else ""
        text = source.text if source else ""
        self.creator_title.configure(text="Edit source" if source else "New source")
        self.name_entry.delete(0, "end")
        self.name_entry.insert(0, name)
        self.editor_box.delete("1.0", "end")
        if text:
            self.editor_box.insert("1.0", text)
        self.editor_snapshot = (name, text)
        self._update_editor_count()
        self._show(self.creator_page)
        self.name_entry.focus_set()

    def show_scores(self) -> None:
        if self.page != "scores" and not self._guard():
            return
        self.page = "scores"
        self._mark_nav("scores")
        self._refresh_score_sources()
        self._show(self.scores_page)

    def show_game(self, source: Source, mode: str) -> None:
        if source.error or not source.text:
            messagebox.showerror("MemoType", "This source has no passage to type.", parent=self)
            return
        if self.page == "game" and self._run_in_progress() and not self._confirm_leave():
            return
        self._stop_tick()
        self.page = "game"
        self._mark_nav("")
        self.game_source = source
        self.engine = Engine(source.text, mode)
        self._alert = False
        self._cursor_on = True
        self.game_title.configure(text=source.name)
        self.mode_pill.configure(text="Practice" if mode == PRACTICE else "Recall")
        best = self.scores.best(source.path.name, mode=mode)
        self.best_label.configure(text=f"Best {best['score']}" if best else "No score yet")
        self.hint.configure(
            text=(
                "Type what you see. A wrong key is marked and does not advance. Backspace steps back."
                if mode == PRACTICE
                else "Type the next word from memory. Backspace edits it. Ctrl+R reveals it, then you still type it. Revealed characters score nothing."
            )
        )
        if mode == RECALL:
            self.reveal_bar.grid()
        else:
            self.reveal_bar.grid_remove()
        self.done_bar.pack_forget()
        self.hint.pack_forget()
        self.hint.pack(side="left", fill="x", expand=True)
        self._render()
        self._refresh_stats()
        self._show(self.game_page)
        self.after(30, self.focus_force)
        self._tick()

    # --- library -----------------------------------------------------------

    def _build_library(self) -> None:
        page = self.library_page
        page.grid_columnconfigure(0, weight=1)
        page.grid_columnconfigure(1, weight=0)
        page.grid_rowconfigure(1, weight=1)

        header = ctk.CTkFrame(page, fg_color="transparent")
        header.grid(row=0, column=0, columnspan=2, sticky="ew", padx=28, pady=(24, 8))
        ctk.CTkLabel(header, text="Library", text_color=TEXT, font=_font(28, "bold")).pack(side="left")
        ctk.CTkButton(
            header,
            text="Import text file",
            command=self._import_source,
            height=36,
            corner_radius=8,
            font=_font(13),
            fg_color=SURFACE,
            text_color=TEXT,
            border_width=1,
            border_color=BORDER,
            hover_color=SURFACE_ALT,
        ).pack(side="right")
        ctk.CTkButton(
            header,
            text="Refresh",
            command=self._refresh_library,
            height=36,
            width=90,
            corner_radius=8,
            font=_font(13),
            fg_color=SURFACE,
            text_color=TEXT,
            border_width=1,
            border_color=BORDER,
            hover_color=SURFACE_ALT,
        ).pack(side="right", padx=(0, 8))

        self.source_list = ctk.CTkScrollableFrame(
            page,
            fg_color="transparent",
            corner_radius=0,
            scrollbar_fg_color=BG,
            scrollbar_button_color="#D5DCE6",
            scrollbar_button_hover_color=MUTED,
        )
        self.source_list.grid(row=1, column=0, sticky="nsew", padx=(20, 8), pady=(8, 20))

        self.detail = ctk.CTkFrame(page, fg_color=SURFACE, corner_radius=16, border_width=1, border_color=BORDER)
        self.detail.grid(row=1, column=1, sticky="nsew", padx=(8, 28), pady=(8, 20))
        self.detail.configure(width=380)
        self.detail.grid_propagate(False)
        self.detail_empty = ctk.CTkLabel(
            self.detail,
            text="Select a source to practice it\nor start a recall run.",
            text_color=MUTED,
            font=_font(15),
            justify="left",
        )
        self.detail_body = ctk.CTkFrame(self.detail, fg_color="transparent")
        self.detail_name = ctk.CTkLabel(self.detail_body, text="", text_color=TEXT, font=_font(24, "bold"), anchor="w", wraplength=320, justify="left")
        self.detail_meta = ctk.CTkLabel(self.detail_body, text="", text_color=MUTED, font=_font(13), anchor="w")
        self.detail_excerpt = ctk.CTkLabel(self.detail_body, text="", text_color=TEXT, font=_font(14), anchor="w", justify="left", wraplength=320)
        self.detail_best = ctk.CTkLabel(self.detail_body, text="", text_color=MUTED, font=_font(13), anchor="w", justify="left")
        self.detail_name.pack(fill="x", padx=22, pady=(22, 4))
        self.detail_meta.pack(fill="x", padx=22)
        self.detail_excerpt.pack(fill="x", padx=22, pady=(16, 8))
        self.detail_best.pack(fill="x", padx=22, pady=(0, 16))
        ctk.CTkButton(
            self.detail_body,
            text="Practice\nSee the passage and type along",
            command=lambda: self._play(PRACTICE),
            height=64,
            corner_radius=12,
            font=_font(15, "bold"),
            fg_color=ACCENT,
            hover_color=ACCENT_HOVER,
            anchor="w",
        ).pack(fill="x", padx=22, pady=(4, 8))
        ctk.CTkButton(
            self.detail_body,
            text="Recall\nHidden until each word is correct",
            command=lambda: self._play(RECALL),
            height=64,
            corner_radius=12,
            font=_font(15, "bold"),
            fg_color=SURFACE,
            text_color=ACCENT,
            border_width=1,
            border_color=ACCENT,
            hover_color=ACCENT_SOFT,
            anchor="w",
        ).pack(fill="x", padx=22, pady=(0, 18))
        row = ctk.CTkFrame(self.detail_body, fg_color="transparent")
        row.pack(fill="x", padx=22, pady=(0, 22))
        ctk.CTkButton(
            row,
            text="Edit",
            command=self._edit_selected,
            height=36,
            corner_radius=8,
            font=_font(13),
            fg_color=SURFACE_ALT,
            text_color=TEXT,
            hover_color=BORDER,
        ).pack(side="left")
        ctk.CTkButton(
            row,
            text="Delete",
            command=self._delete_selected,
            height=36,
            corner_radius=8,
            font=_font(13),
            fg_color=SURFACE,
            text_color=BAD,
            border_width=1,
            border_color=BORDER,
            hover_color=BAD_SOFT,
        ).pack(side="left", padx=(8, 0))

    def _refresh_library(self) -> None:
        if self.page != "library" and not self.source_list.winfo_exists():
            return
        selected_name = self.selected.path.name if self.selected else None
        for child in self.source_list.winfo_children():
            child.destroy()
        sources = self.sources.list_sources()
        self.selected = None
        if not sources:
            ctk.CTkLabel(
                self.source_list,
                text="No sources yet. Create one, import a text file,\nor drop a .txt file into the sources folder.",
                text_color=MUTED,
                font=_font(14),
                justify="left",
                anchor="w",
            ).pack(fill="x", padx=8, pady=12)
            self._show_detail(None)
            self._fit_scrollbar(self.source_list)
            return
        for source in sources:
            self._source_row(source, selected=source.path.name == selected_name)
            if source.path.name == selected_name:
                self.selected = source
        if self.selected is None:
            self.selected = sources[0]
            self._highlight_rows()
        self._show_detail(self.selected)
        self._fit_scrollbar(self.source_list)

    def _source_row(self, source: Source, selected: bool) -> None:
        best = self.scores.best(source.path.name)
        subtitle = f"{source.word_count} words"
        subtitle += f"   ·   best {best['score']}" if best else "   ·   no score yet"
        row = ctk.CTkFrame(
            self.source_list,
            fg_color=ACCENT_SOFT if selected else SURFACE,
            corner_radius=12,
            border_width=1,
            border_color=ACCENT if selected else BORDER,
            cursor="hand2",
        )
        row.pack(fill="x", pady=4, padx=4)
        row._source = source  # type: ignore[attr-defined]
        name = ctk.CTkLabel(row, text=source.name, text_color=TEXT, font=_font(15, "bold"), anchor="w")
        meta = ctk.CTkLabel(row, text=subtitle, text_color=MUTED, font=_font(12), anchor="w")
        name.pack(fill="x", padx=14, pady=(10, 0))
        meta.pack(fill="x", padx=14, pady=(0, 10))

        def select(_event=None, item=source):
            self.selected = item
            self._highlight_rows()
            self._show_detail(item)

        for widget in (row, name, meta):
            widget.bind("<Button-1>", select)

    def _highlight_rows(self) -> None:
        chosen = self.selected.path.name if self.selected else None
        for row in self.source_list.winfo_children():
            source = getattr(row, "_source", None)
            if source is None:
                continue
            active = source.path.name == chosen
            row.configure(fg_color=ACCENT_SOFT if active else SURFACE, border_color=ACCENT if active else BORDER)

    def _show_detail(self, source: Source | None) -> None:
        if source is None:
            self.detail_body.pack_forget()
            self.detail_empty.pack(padx=22, pady=22, anchor="w")
            return
        self.detail_empty.pack_forget()
        self.detail_body.pack(fill="both", expand=True)
        self.detail_name.configure(text=source.name)
        excerpt = source.text.replace("\n", " ")
        if len(excerpt) > 180:
            excerpt = excerpt[:177].rstrip() + "…"
        self.detail_meta.configure(text=f"{source.word_count} words   ·   {source.char_count} characters")
        self.detail_excerpt.configure(text=excerpt or "This file is empty.")
        practice = self.scores.best(source.path.name, PRACTICE)
        recall = self.scores.best(source.path.name, RECALL)
        practice_text = str(practice["score"]) if practice else "—"
        recall_text = str(recall["score"]) if recall else "—"
        self.detail_best.configure(text=f"Practice best  {practice_text}\nRecall best  {recall_text}")

    def _play(self, mode: str) -> None:
        if self.selected is None:
            return
        fresh = self.sources.get(self.selected.path.name)
        if fresh is None:
            messagebox.showerror("MemoType", "That source is no longer in the folder.", parent=self)
            self._refresh_library()
            return
        self.selected = fresh
        self.show_game(fresh, mode)

    def _edit_selected(self) -> None:
        if self.selected is not None:
            self.show_creator(self.selected)

    def _delete_selected(self) -> None:
        source = self.selected
        if source is None:
            return
        if not messagebox.askyesno("Delete source?", f'Delete "{source.name}" and its high scores?', parent=self):
            return
        try:
            self.sources.delete(source.path)
        except (OSError, ValueError) as exc:
            messagebox.showerror("MemoType", str(exc), parent=self)
            return
        self.scores.delete(source.path.name)
        self.selected = None
        self._refresh_library()

    def _import_source(self) -> None:
        chosen = filedialog.askopenfilename(
            parent=self,
            title="Import a text file",
            filetypes=[("Text files", "*.txt *.text *.md"), ("All files", "*.*")],
        )
        if not chosen:
            return
        try:
            path = self.sources.import_file(Path(chosen))
        except (OSError, ValueError, UnicodeError) as exc:
            messagebox.showerror("MemoType", str(exc), parent=self)
            return
        self.selected = self.sources.get(path.name)
        self.show_library()

    def _open_folder(self) -> None:
        try:
            target = ensure_samples() if self.tool == "flashcards" else self.sources.folder
            os.startfile(target)  # type: ignore[attr-defined]
        except OSError as exc:
            messagebox.showerror("MemoType", str(exc), parent=self)

    # --- creator -----------------------------------------------------------

    def _build_creator(self) -> None:
        page = self.creator_page
        page.grid_rowconfigure(1, weight=1)
        wrap = ctk.CTkFrame(page, fg_color="transparent")
        wrap.grid(row=0, column=0, sticky="ew", padx=48, pady=(24, 0))
        self.creator_title = ctk.CTkLabel(wrap, text="New source", text_color=TEXT, font=_font(28, "bold"))
        self.creator_title.pack(anchor="w")
        ctk.CTkLabel(
            wrap,
            text="Name the passage and paste it here. It is saved as a text file in your sources folder.",
            text_color=MUTED,
            font=_font(14),
        ).pack(anchor="w", pady=(4, 0))

        card = ctk.CTkFrame(page, fg_color=SURFACE, corner_radius=16, border_width=1, border_color=BORDER)
        card.grid(row=1, column=0, sticky="nsew", padx=48, pady=16)
        card.grid_columnconfigure(0, weight=1)
        card.grid_rowconfigure(2, weight=1)
        ctk.CTkLabel(card, text="Name", text_color=MUTED, font=_font(12), anchor="w").grid(row=0, column=0, sticky="w", padx=18, pady=(16, 4))
        self.name_entry = ctk.CTkEntry(card, height=42, corner_radius=10, font=_font(16), placeholder_text="Source name", border_color=BORDER)
        self.name_entry.grid(row=1, column=0, sticky="ew", padx=18, pady=(0, 10))
        self.editor_box = ctk.CTkTextbox(card, font=("Georgia", 17), corner_radius=12, border_width=1, border_color=BORDER, fg_color=SURFACE_ALT, text_color=TEXT)
        self.editor_box.grid(row=2, column=0, sticky="nsew", padx=18, pady=(0, 12))
        self.editor_box.bind("<KeyRelease>", self._editor_changed)
        self.editor_box.bind("<<Paste>>", self._editor_changed)
        inner = getattr(self.editor_box, "_textbox", None)
        if inner is not None:
            inner.configure(undo=True, wrap="word")

        bar = ctk.CTkFrame(page, fg_color="transparent")
        bar.grid(row=2, column=0, sticky="ew", padx=48, pady=(0, 24))
        self.editor_count = ctk.CTkLabel(bar, text="0 words", text_color=MUTED, font=_font(13))
        self.editor_count.pack(side="left")
        ctk.CTkButton(
            bar,
            text="Save source",
            command=self._save_source,
            height=40,
            width=140,
            corner_radius=8,
            font=_font(14, "bold"),
            fg_color=ACCENT,
            hover_color=ACCENT_HOVER,
        ).pack(side="right")
        ctk.CTkButton(
            bar,
            text="Cancel",
            command=self._cancel_editor,
            height=40,
            width=100,
            corner_radius=8,
            font=_font(14),
            fg_color=SURFACE,
            text_color=TEXT,
            border_width=1,
            border_color=BORDER,
            hover_color=SURFACE_ALT,
        ).pack(side="right", padx=(0, 8))
        self.bind("<Control-s>", self._save_shortcut)

    def _editor_changed(self, _event=None):
        self.after(1, self._update_editor_count)

    def _update_editor_count(self) -> None:
        text = self.editor_box.get("1.0", "end-1c")
        words = len(text.split())
        self.editor_count.configure(text=f"{words} word" if words == 1 else f"{words} words")

    def _editor_dirty(self) -> bool:
        name = self.name_entry.get().strip()
        text = self.editor_box.get("1.0", "end-1c")
        return (name, text) != self.editor_snapshot

    def _cancel_editor(self) -> None:
        if self._editor_dirty() and not messagebox.askyesno("Discard changes?", "This source has not been saved.", parent=self):
            return
        self.editor_snapshot = (self.name_entry.get().strip(), self.editor_box.get("1.0", "end-1c"))
        self.show_library()

    def _save_shortcut(self, event):
        if self.page == "creator":
            self._save_source()
            return "break"
        return None

    def _save_source(self) -> None:
        name = self.name_entry.get()
        text = self.editor_box.get("1.0", "end-1c")
        original = self.editor_original.path if self.editor_original else None
        old_filename = self.editor_original.path.name if self.editor_original else None
        try:
            path = self.sources.save(name, text, original=original)
        except (OSError, ValueError) as exc:
            messagebox.showerror("MemoType", str(exc), parent=self)
            return
        if old_filename and old_filename != path.name:
            self.scores.rename(old_filename, path.name)
        self.editor_original = self.sources.get(path.name)
        self.editor_snapshot = (self.name_entry.get().strip(), self.editor_box.get("1.0", "end-1c"))
        self.selected = self.editor_original
        self.show_library()

    # --- game --------------------------------------------------------------

    def _build_game(self) -> None:
        page = self.game_page
        page.grid_columnconfigure(0, weight=1)
        page.grid_rowconfigure(3, weight=1)

        top = ctk.CTkFrame(page, fg_color="transparent")
        top.grid(row=0, column=0, sticky="ew", padx=28, pady=(20, 8))
        ctk.CTkButton(
            top,
            text="Library",
            command=self.show_library,
            height=34,
            width=90,
            corner_radius=8,
            font=_font(13),
            fg_color=SURFACE,
            text_color=TEXT,
            border_width=1,
            border_color=BORDER,
            hover_color=SURFACE_ALT,
        ).pack(side="left")
        titles = ctk.CTkFrame(top, fg_color="transparent")
        titles.pack(side="left", padx=16)
        self.game_title = ctk.CTkLabel(titles, text="", text_color=TEXT, font=_font(20, "bold"))
        self.game_title.pack(side="left")
        self.mode_pill = ctk.CTkLabel(titles, text="", text_color=ACCENT, font=_font(13, "bold"), fg_color=ACCENT_SOFT, corner_radius=8)
        self.mode_pill.pack(side="left", padx=10)
        self.best_label = ctk.CTkLabel(top, text="", text_color=MUTED, font=_font(13))
        self.best_label.pack(side="right")

        stats = ctk.CTkFrame(page, fg_color="transparent")
        stats.grid(row=1, column=0, sticky="ew", padx=28, pady=(0, 8))
        self.stat_time = self._stat(stats, "Time")
        self.stat_score = self._stat(stats, "Score")
        self.stat_wpm = self._stat(stats, "WPM")
        self.stat_accuracy = self._stat(stats, "Accuracy")
        self.stat_mistakes = self._stat(stats, "Mistakes")
        self.stat_reveals = self._stat(stats, "Reveals")
        self.stat_progress = self._stat(stats, "Progress")

        self.reveal_bar = ctk.CTkFrame(page, fg_color=WARN_SOFT, corner_radius=12)
        self.reveal_bar.grid(row=2, column=0, sticky="ew", padx=28, pady=(0, 8))
        self.reveal_label = ctk.CTkLabel(self.reveal_bar, text="", text_color=WARN, font=_font(16, "bold"), anchor="w")
        self.reveal_label.pack(fill="x", padx=16, pady=10)
        self.reveal_bar.grid_remove()

        holder = ctk.CTkFrame(page, fg_color=SURFACE, corner_radius=16, border_width=1, border_color=BORDER)
        holder.grid(row=3, column=0, sticky="nsew", padx=28, pady=(0, 8))
        holder.grid_rowconfigure(0, weight=1)
        holder.grid_columnconfigure(0, weight=1)
        self.passage = tk.Text(
            holder,
            font=PASSAGE,
            wrap="word",
            relief="flat",
            borderwidth=0,
            highlightthickness=0,
            bg=SURFACE,
            fg=TEXT,
            padx=22,
            pady=18,
            spacing1=2,
            spacing3=8,
            insertwidth=0,
            cursor="arrow",
            takefocus=0,
            state="disabled",
        )
        self.passage.grid(row=0, column=0, sticky="nsew", padx=(8, 0), pady=8)
        scroll = ctk.CTkScrollbar(holder, command=self.passage.yview)
        scroll.grid(row=0, column=1, sticky="ns", padx=(0, 8), pady=12)
        self.passage.configure(yscrollcommand=scroll.set)
        self.passage.tag_configure("done", foreground=TEXT)
        self.passage.tag_configure("pending", foreground=FAINT)
        self.passage.tag_configure("caret", background=ACCENT_SOFT, foreground=ACCENT)
        self.passage.tag_configure("alert", background=BAD_SOFT, foreground=BAD)
        self.passage.tag_configure("live", foreground=ACCENT)
        self.passage.tag_configure("cursor", background=ACCENT, foreground=ACCENT)
        self.passage.tag_configure("hint", foreground=FAINT, font=("Segoe UI", 18))
        self.passage.tag_raise("alert")
        self.passage.tag_raise("cursor")
        self.placeholder = ctk.CTkLabel(
            holder,
            text="Type the first word from memory.",
            text_color=FAINT,
            font=_font(18),
            fg_color=SURFACE,
        )
        self.passage.bind("<MouseWheel>", self._wheel)
        holder.bind("<Button-1>", lambda _event: self.focus_set())
        self.passage.bind("<Button-1>", lambda _event: self.focus_set())

        foot = ctk.CTkFrame(page, fg_color="transparent")
        foot.grid(row=4, column=0, sticky="ew", padx=28, pady=(0, 18))
        self.hint = ctk.CTkLabel(foot, text="", text_color=MUTED, font=_font(13), anchor="w", justify="left", wraplength=760)
        self.hint.pack(side="left", fill="x", expand=True)
        self.done_bar = ctk.CTkFrame(foot, fg_color="transparent")
        self.done_message = ctk.CTkLabel(self.done_bar, text="", text_color=GOOD, font=_font(14, "bold"))
        self.done_message.pack(side="left", padx=(0, 12))
        ctk.CTkButton(
            self.done_bar,
            text="Library",
            command=self.show_library,
            height=36,
            width=90,
            corner_radius=8,
            font=_font(13),
            fg_color=SURFACE,
            text_color=TEXT,
            border_width=1,
            border_color=BORDER,
            hover_color=SURFACE_ALT,
        ).pack(side="right")
        self.again_button = ctk.CTkButton(
            self.done_bar,
            text="Play again",
            command=self._play_again,
            height=36,
            corner_radius=8,
            font=_font(13, "bold"),
            fg_color=ACCENT,
            hover_color=ACCENT_HOVER,
        )
        self.again_button.pack(side="right", padx=(0, 8))
        self.switch_button = ctk.CTkButton(
            self.done_bar,
            text="Try recall",
            command=self._switch_mode,
            height=36,
            corner_radius=8,
            font=_font(13),
            fg_color=SURFACE,
            text_color=ACCENT,
            border_width=1,
            border_color=ACCENT,
            hover_color=ACCENT_SOFT,
        )
        self.switch_button.pack(side="right", padx=(0, 8))

    def _stat(self, parent, caption: str) -> ctk.CTkLabel:
        chip = ctk.CTkFrame(parent, fg_color=SURFACE, corner_radius=12, border_width=1, border_color=BORDER)
        chip.pack(side="left", padx=(0, 8))
        ctk.CTkLabel(chip, text=caption, text_color=MUTED, font=_font(11)).pack(anchor="w", padx=12, pady=(6, 0))
        value = ctk.CTkLabel(chip, text="—", text_color=TEXT, font=_font(18, "bold"))
        value.pack(anchor="w", padx=12, pady=(0, 6))
        return value

    def _wheel(self, event):
        self.passage.yview_scroll(int(-event.delta / 120), "units")
        return "break"

    def _index(self, pos: int) -> str:
        return f"1.0+{pos}c"

    def _set_passage(self, content: str) -> None:
        self.passage.configure(state="normal")
        self.passage.delete("1.0", "end")
        if content:
            self.passage.insert("1.0", content)
        self.passage.configure(state="disabled")

    def _render(self) -> None:
        engine = self.engine
        if engine is None:
            return
        if engine.mode == PRACTICE:
            if self.passage.get("1.0", "end-1c") != engine.text:
                self._set_passage(engine.text)
            self.passage.configure(state="normal")
            end = "end-1c"
            self.passage.tag_remove("done", "1.0", "end")
            self.passage.tag_remove("pending", "1.0", "end")
            self.passage.tag_remove("caret", "1.0", "end")
            self.passage.tag_remove("alert", "1.0", "end")
            self.passage.tag_add("pending", "1.0", "end")
            if engine.pos > 0:
                self.passage.tag_add("done", "1.0", self._index(engine.pos))
            if engine.pos < len(engine.text):
                caret_end = self._index(engine.pos + 1)
                self.passage.tag_add("caret", self._index(engine.pos), caret_end)
                if self._alert:
                    self.passage.tag_add("alert", self._index(engine.pos), caret_end)
                self.passage.see(self._index(engine.pos))
            self.passage.configure(state="disabled")
            self.placeholder.place_forget()
        else:
            visible = engine.visible_text()
            show_cursor = not engine.finished
            hint = ""
            if show_cursor and not visible:
                hint = "   Type the revealed word." if engine.revealed else "   Type the first word from memory."
            self._set_passage(visible + (CURSOR if show_cursor else "") + hint)
            self.passage.configure(state="normal")
            if visible:
                typed = len(engine.typed)
                if typed and not engine.finished:
                    start = len(visible) - typed
                    self.passage.tag_add("done", "1.0", self._index(start))
                    self.passage.tag_add("live", self._index(start), self._index(len(visible)))
                else:
                    self.passage.tag_add("done", "1.0", self._index(len(visible)))
            if show_cursor:
                cursor_at = len(visible)
                self.passage.tag_add("cursor", self._index(cursor_at), self._index(cursor_at + 1))
                if hint:
                    self.passage.tag_add("hint", self._index(cursor_at + 1), "end-1c")
                self._paint_cursor()
                self._ensure_cursor_blink()
                self.passage.see(self._index(cursor_at))
            self.passage.configure(state="disabled")
            self.placeholder.place_forget()
            if engine.finished:
                self.reveal_label.configure(text="Passage complete.", text_color=GOOD)
                self.reveal_bar.configure(fg_color=GOOD_SOFT)
            elif engine.revealed:
                self.reveal_bar.configure(fg_color=WARN_SOFT)
                self.reveal_label.configure(text=engine.current_word, text_color=WARN)
            elif self._alert:
                self.reveal_bar.configure(fg_color=BAD_SOFT)
                self.reveal_label.configure(text="Incorrect", text_color=BAD)
            else:
                self.reveal_bar.configure(fg_color=SURFACE_ALT)
                self.reveal_label.configure(text="Current word hidden    ·    Ctrl+R reveals it", text_color=MUTED)

    def _refresh_stats(self) -> None:
        engine = self.engine
        if engine is None:
            return
        now = self._clock()
        accuracy = engine.accuracy()
        self.stat_time.configure(text=format_time(engine.elapsed(now)))
        self.stat_score.configure(text=str(engine.score))
        elapsed = engine.elapsed(now)
        self.stat_wpm.configure(text="—" if elapsed < 1 else f"{engine.wpm(now):.0f}")
        self.stat_accuracy.configure(text="—" if accuracy is None else f"{accuracy:.0f}%")
        self.stat_mistakes.configure(text=str(engine.mistakes), text_color=BAD if self._alert else TEXT)
        self.stat_reveals.configure(text=str(engine.reveals) if engine.mode == RECALL else "—")
        if engine.mode == RECALL:
            progress = f"{min(engine.word_index(), engine.word_total())}/{engine.word_total()}"
        else:
            percent = engine.progress() * 100
            if engine.finished or percent >= 99.5:
                progress = "100%" if engine.finished else f"{percent:.0f}%"
            elif percent > 0:
                progress = "<1%" if percent < 1 else f"{percent:.0f}%"
            else:
                progress = "0%"
        self.stat_progress.configure(text=progress)

    def _tick(self) -> None:
        if self.page != "game" or self.engine is None:
            return
        self._refresh_stats()
        if not self.engine.finished:
            self._tick_id = self.after(100, self._tick)

    def _stop_tick(self) -> None:
        if self._tick_id is not None:
            try:
                self.after_cancel(self._tick_id)
            except tk.TclError:
                pass
            self._tick_id = None
        if self._cursor_id is not None:
            try:
                self.after_cancel(self._cursor_id)
            except tk.TclError:
                pass
            self._cursor_id = None
        if self._flash_id is not None:
            try:
                self.after_cancel(self._flash_id)
            except tk.TclError:
                pass
            self._flash_id = None

    def _paint_cursor(self) -> None:
        if self._alert and self._cursor_on:
            color = BAD
        elif self._cursor_on:
            color = ACCENT
        else:
            color = SURFACE
        self.passage.tag_configure("cursor", background=color, foreground=color)

    def _ensure_cursor_blink(self) -> None:
        if self._cursor_id is None:
            self._cursor_id = self.after(520, self._blink_cursor)

    def _blink_cursor(self) -> None:
        self._cursor_id = None
        engine = self.engine
        if self.page != "game" or engine is None or engine.mode != RECALL or engine.finished:
            return
        self._cursor_on = not self._cursor_on
        self._paint_cursor()
        self._cursor_id = self.after(520, self._blink_cursor)

    def _mistake(self) -> None:
        self._alert = True
        self._render()
        self._refresh_stats()
        if self._flash_id is not None:
            self.after_cancel(self._flash_id)
        self._flash_id = self.after(220, self._clear_alert)

    def _clear_alert(self) -> None:
        self._alert = False
        self._flash_id = None
        if self.page == "game":
            self._render()
            self._refresh_stats()

    def _on_key(self, event):
        if self.tool == "flashcards" and self.flash.on_key(event):
            return "break"
        if self.tool == "flashcards":
            return
        if self.page == "creator" and event.state & 0x4 and event.keysym.lower() == "s":
            return
        if self.page != "game" or self.engine is None:
            return
        if event.keysym == "Escape":
            self.show_library()
            return "break"
        if self.engine.finished:
            return "break"
        if event.keysym in {"Prior", "Next"}:
            self.passage.yview_scroll(-1 if event.keysym == "Prior" else 1, "pages")
            return "break"
        # On Windows, Num Lock sets bit 0x8. That bit is Alt on other systems,
        # so only 0x4 (Control) and 0x20000 (Alt) may block typing.
        control = bool(event.state & 0x4)
        alt = bool(event.state & 0x20000)
        if control and event.keysym.lower() == "r":
            if self.engine.reveal(self._clock()):
                self._render()
                self._refresh_stats()
            return "break"
        if control or alt:
            return "break"
        if event.keysym == "BackSpace":
            self.engine.backspace()
            self._alert = False
            self._render()
            self._refresh_stats()
            return "break"
        char = event.char
        if event.keysym in {"Return", "KP_Enter"}:
            char = "\n"
        if not char or char < " " and char != "\n":
            return "break"
        result = self.engine.handle_char(char, self._clock())
        if result == "mistake":
            self._mistake()
        elif result == "done":
            self._alert = False
            self._render()
            self._refresh_stats()
            self._finish_run()
        elif result == "ok":
            self._alert = False
            self._render()
            self._refresh_stats()
        return "break"

    def _finish_run(self) -> None:
        engine = self.engine
        source = self.game_source
        if engine is None or source is None or not engine.finished:
            return
        now = self._clock()
        accuracy = engine.accuracy()
        entry = {
            "mode": engine.mode,
            "score": engine.score,
            "wpm": round(engine.wpm(now), 1),
            "accuracy": None if accuracy is None else round(accuracy, 1),
            "seconds": round(engine.elapsed(now), 2),
            "mistakes": engine.mistakes,
            "reveals": engine.reveals,
            "date": datetime.now().isoformat(timespec="seconds"),
        }
        result = self.scores.record(source.path.name, entry)
        if result["standing"] == "best":
            message = "New personal best"
        elif result["standing"] == "tie":
            message = f"Tied your best of {result['previous_best']}"
        elif result["rank"]:
            message = f"Ranked #{result['rank']}"
            if result["previous_best"] is not None:
                message += f"  ·  best {result['previous_best']}"
        else:
            message = "Run saved"
        self.done_message.configure(text=message)
        other = "Try recall" if engine.mode == PRACTICE else "Try practice"
        self.switch_button.configure(text=other)
        self.hint.pack_forget()
        self.done_bar.pack(side="right")
        best = self.scores.best(source.path.name, mode=engine.mode)
        self.best_label.configure(text=f"Best {best['score']}" if best else "No score yet")
        self._stop_tick()
        self._refresh_stats()

    def _play_again(self) -> None:
        if self.game_source and self.engine:
            mode = self.engine.mode
            source = self.sources.get(self.game_source.path.name) or self.game_source
            self.engine.ended_at = self.engine.ended_at or self._clock()
            self.page = "library"
            self.show_game(source, mode)

    def _switch_mode(self) -> None:
        if self.game_source and self.engine:
            mode = RECALL if self.engine.mode == PRACTICE else PRACTICE
            source = self.sources.get(self.game_source.path.name) or self.game_source
            self.page = "library"
            self.show_game(source, mode)

    # --- scores ------------------------------------------------------------

    def _build_scores(self) -> None:
        page = self.scores_page
        page.grid_rowconfigure(1, weight=1)
        header = ctk.CTkFrame(page, fg_color="transparent")
        header.grid(row=0, column=0, sticky="ew", padx=28, pady=(24, 8))
        ctk.CTkLabel(header, text="High scores", text_color=TEXT, font=_font(28, "bold")).pack(side="left")
        self.score_table = ctk.CTkScrollableFrame(
            page,
            fg_color=SURFACE,
            corner_radius=16,
            border_width=1,
            border_color=BORDER,
            scrollbar_fg_color=SURFACE,
            scrollbar_button_color="#D5DCE6",
            scrollbar_button_hover_color=MUTED,
        )
        self.score_table.grid(row=1, column=0, sticky="nsew", padx=28, pady=(8, 24))
        self._score_names: dict[str, str] = {}
        self.score_filter = ctk.CTkSegmentedButton(
            header,
            values=["All", "Practice", "Recall"],
            command=lambda _value: self._fill_scores(),
            font=_font(13),
        )
        self.score_filter.pack(side="right")
        self.score_source = ctk.CTkOptionMenu(header, values=["No sources"], command=lambda _value: self._fill_scores(), font=_font(13), fg_color=SURFACE, text_color=TEXT, button_color=ACCENT, button_hover_color=ACCENT_HOVER)
        self.score_source.pack(side="right", padx=(0, 12))
        self.score_filter.set("All")

    def _refresh_score_sources(self) -> None:
        sources = self.sources.list_sources()
        self._score_names = {source.name: source.path.name for source in sources}
        names = list(self._score_names)
        if not names:
            self.score_source.configure(values=["No sources"])
            self.score_source.set("No sources")
        else:
            self.score_source.configure(values=names)
            current = self.score_source.get()
            preferred = self.selected.name if self.selected else current
            self.score_source.set(preferred if preferred in self._score_names else names[0])
        self._fill_scores()

    def _fill_scores(self) -> None:
        for child in self.score_table.winfo_children():
            child.destroy()
        filename = self._score_names.get(self.score_source.get())
        if not filename:
            ctk.CTkLabel(self.score_table, text="Create a source and finish a run to start the board.", text_color=MUTED, font=_font(14)).pack(anchor="w", padx=16, pady=16)
            self._fit_scrollbar(self.score_table)
            return
        runs = self.scores.for_source(filename)
        choice = self.score_filter.get()
        if choice == "Practice":
            runs = [run for run in runs if run.get("mode") == PRACTICE]
        elif choice == "Recall":
            runs = [run for run in runs if run.get("mode") == RECALL]
        note = ctk.CTkLabel(
            self.score_table,
            text="One point per correct character you type from the words. Spaces are free. In recall, a revealed word still has to be typed and scores nothing.",
            text_color=MUTED,
            font=_font(12),
            wraplength=860,
            justify="left",
            anchor="w",
        )
        note.pack(fill="x", padx=16, pady=(12, 8))
        if not runs:
            ctk.CTkLabel(self.score_table, text="No completed runs for this view yet.", text_color=MUTED, font=_font(14)).pack(anchor="w", padx=16, pady=8)
            self._fit_scrollbar(self.score_table)
            return
        columns = ["#", "Mode", "Score", "WPM", "Accuracy", "Time", "Mistakes", "Reveals", "When"]
        widths = [36, 90, 70, 60, 80, 70, 80, 70, 150]
        header = ctk.CTkFrame(self.score_table, fg_color="transparent")
        header.pack(fill="x", padx=8)
        for index, (caption, width) in enumerate(zip(columns, widths)):
            header.grid_columnconfigure(index, minsize=width)
            ctk.CTkLabel(header, text=caption, text_color=FAINT, font=_font(12, "bold"), anchor="w").grid(row=0, column=index, sticky="w", padx=6, pady=4)
        for rank, run in enumerate(runs, start=1):
            row = ctk.CTkFrame(self.score_table, fg_color=SURFACE_ALT if rank % 2 == 0 else "transparent", corner_radius=8)
            row.pack(fill="x", padx=8, pady=1)
            accuracy = run.get("accuracy")
            values = [
                str(rank),
                "Practice" if run.get("mode") == PRACTICE else "Recall",
                str(run.get("score", 0)),
                f"{float(run.get('wpm', 0)):.0f}",
                "—" if accuracy is None else f"{float(accuracy):.0f}%",
                format_time(float(run.get("seconds", 0))),
                str(run.get("mistakes", 0)),
                "—" if run.get("mode") != RECALL else str(run.get("reveals", 0)),
                format_when(str(run.get("date", ""))),
            ]
            for index, (value, width) in enumerate(zip(values, widths)):
                row.grid_columnconfigure(index, minsize=width)
                color = ACCENT if index == 1 and run.get("mode") == PRACTICE else WARN if index == 1 else TEXT
                ctk.CTkLabel(row, text=value, text_color=color, font=_font(13, "bold" if index == 2 else "normal"), anchor="w").grid(
                    row=0, column=index, sticky="w", padx=6, pady=6
                )
        self._fit_scrollbar(self.score_table)

    def _fit_scrollbar(self, frame: ctk.CTkScrollableFrame) -> None:
        """Hide a scrollbar when the list already fits, so short pages stay clean."""

        def relax() -> None:
            if not frame.winfo_exists():
                return
            canvas = frame._parent_canvas
            canvas.update_idletasks()
            box = canvas.bbox("all")
            if box is None:
                return
            needed = (box[3] - box[1]) > canvas.winfo_height() + 2
            if needed:
                if not frame._scrollbar.winfo_ismapped():
                    frame._scrollbar.grid()
            else:
                frame._scrollbar.grid_remove()

        self.after(40, relax)

    def destroy(self):
        self._stop_tick()
        if getattr(self, "flash", None) is not None:
            self.flash.cancel()
        super().destroy()
