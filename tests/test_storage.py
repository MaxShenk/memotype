import tempfile
import unittest
from pathlib import Path

from memotype.scores import ScoreStore
from memotype.sources import SourceStore


class SourceStoreTests(unittest.TestCase):
    def test_save_import_and_refuse_duplicate_name(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = SourceStore(Path(tmp))
            store.ensure_ready()
            first = store.save("My Speech", "  Four score.  ")
            self.assertEqual(first.read_text(encoding="utf-8").strip(), "Four score.")
            with self.assertRaises(ValueError):
                store.save("My Speech", "Other words.")
            outside_dir = Path(tmp) / "incoming"
            outside_dir.mkdir()
            outside = outside_dir / "drop.txt"
            outside.write_text("Imported line.\n", encoding="utf-8")
            imported = store.import_file(outside)
            self.assertEqual(imported.stem, "drop")
            names = [item.name for item in store.list_sources()]
            self.assertIn("Getting Started", names)
            self.assertIn("My Speech", names)
            renamed = store.save("Later Name", "Four score and seven.", original=first)
            self.assertEqual(renamed.name, "Later Name.txt")
            self.assertFalse(first.exists())
            store.delete(renamed)
            self.assertIsNone(store.get("Later Name.txt"))

    def test_sample_is_not_recreated_after_init(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = SourceStore(Path(tmp))
            store.ensure_ready()
            for path in Path(tmp).glob("*.txt"):
                path.unlink()
            store.ensure_ready()
            self.assertEqual(list(Path(tmp).glob("*.txt")), [])


class ScoreStoreTests(unittest.TestCase):
    def test_ranks_best_and_rename(self):
        with tempfile.TemporaryDirectory() as tmp:
            scores = ScoreStore(Path(tmp) / "scores.json")
            first = scores.record("a.txt", {"mode": "practice", "score": 10, "wpm": 40, "seconds": 20})
            self.assertEqual(first["standing"], "best")
            self.assertEqual(first["rank"], 1)
            second = scores.record("a.txt", {"mode": "recall", "score": 8, "wpm": 30, "seconds": 30})
            self.assertEqual(second["standing"], "ranked")
            self.assertEqual(second["rank"], 2)
            tie = scores.record("a.txt", {"mode": "practice", "score": 10, "wpm": 10, "seconds": 50})
            self.assertEqual(tie["standing"], "tie")
            self.assertEqual(scores.best("a.txt")["score"], 10)
            self.assertEqual(scores.best("a.txt", mode="recall")["score"], 8)
            scores.rename("a.txt", "b.txt")
            self.assertEqual(len(scores.for_source("b.txt")), 3)
            self.assertEqual(scores.for_source("a.txt"), [])
            scores.delete("b.txt")
            self.assertEqual(scores.for_source("b.txt"), [])


if __name__ == "__main__":
    unittest.main()
