"""Launch MemoType."""

from __future__ import annotations

import logging
import sys
import traceback

from memotype.app import MemoTypeApp
from memotype.paths import log_path


def _configure_logging() -> None:
    try:
        path = log_path()
        logging.basicConfig(
            filename=str(path),
            level=logging.INFO,
            format="%(asctime)s %(levelname)s %(message)s",
        )
    except Exception:
        logging.basicConfig(level=logging.INFO)


def main() -> None:
    _configure_logging()
    logging.info("starting MemoType")
    try:
        app = MemoTypeApp()
        app.mainloop()
    except Exception:
        logging.exception("MemoType failed")
        try:
            import tkinter as tk
            from tkinter import messagebox

            root = tk.Tk()
            root.withdraw()
            messagebox.showerror("MemoType", "MemoType could not start.\n\n" + traceback.format_exc())
            root.destroy()
        except Exception:
            pass
        sys.exit(1)


if __name__ == "__main__":
    main()
