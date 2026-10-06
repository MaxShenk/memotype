import json
import tempfile
import unittest
from pathlib import Path

from memotype.flashcards.loader import DeckError, load_json_file
from memotype.flashcards.progress import ProgressStore
from memotype.flashcards.session import CHUNKING, WEIGHTED, Session, hardest_rows, normalize

PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde"
    b"\x00\x00\x00\x0cIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xa7\x9d\x84\x00\x00\x00\x00IEND\xaeB`\x82"
)


class NormalizeTests(unittest.TestCase):
    def test_strips_accents_and_space(self):
        self.assertEqual(normalize("  José  "), "jose")
        self.assertEqual(normalize("josé"), normalize("Jose"))
        self.assertFalse(normalize("   "))


class LoaderTests(unittest.TestCase):
    def test_rejects_bad_files_without_partial_cards(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            deck = folder / "cards.json"
            deck.write_text(json.dumps({"term": "A"}), encoding="utf-8")
            with self.assertRaises(DeckError) as raised:
                load_json_file(deck)
            self.assertIn("array", str(raised.exception))

            deck.write_text("[]", encoding="utf-8")
            with self.assertRaises(DeckError) as raised:
                load_json_file(deck)
            self.assertIn("empty array", str(raised.exception))

            deck.write_text(json.dumps([{"term": "A", "definition": "  "}]), encoding="utf-8")
            with self.assertRaises(DeckError) as raised:
                load_json_file(deck)
            self.assertIn("definition", str(raised.exception))

            deck.write_text(json.dumps([{"term": "", "definition": "Paris"}]), encoding="utf-8")
            with self.assertRaises(DeckError) as raised:
                load_json_file(deck)
            self.assertIn("term", str(raised.exception))

    def test_inlines_a_local_image(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            (folder / "dot.png").write_bytes(PNG)
            deck = folder / "cards.json"
            deck.write_text(
                json.dumps([{"term": "", "image": "dot.png", "definition": "Dot"}]),
                encoding="utf-8",
            )
            loaded = load_json_file(deck)
            self.assertTrue(loaded.cards[0].image.startswith("data:image/png;base64,"))
            self.assertEqual(loaded.cards[0].term, "")


class SessionTests(unittest.TestCase):
    def _cards(self):
        folder = Path(tempfile.mkdtemp())
        path = folder / "cards.json"
        path.write_text(
            json.dumps(
                [
                    {"term": "France", "definition": "Paris"},
                    {"term": "Spain", "definition": "Madrid"},
                    {"term": "", "image": "", "definition": "skip"},
                ]
            ),
            encoding="utf-8",
        )
        # image-only needs an image; build cards directly instead
        from memotype.flashcards.loader import Card

        return [
            Card("France", "Paris"),
            Card("Spain", "Madrid"),
            Card("", "Heron", "data:image/png;base64,YQ=="),
        ], ProgressStore(folder / "progress.json")

    def test_picture_only_always_asks_for_the_definition(self):
        cards, progress = self._cards()
        session = Session("deck", cards, progress)
        session.set_start_with_term(False)
        session.order = [2, 0, 1]
        session.cursor = 0
        self.assertTrue(session.showing_term())
        self.assertEqual(session.expected_text(), "Heron")
        self.assertEqual(session.prompt_image(), "data:image/png;base64,YQ==")

    def test_wrong_answer_requires_the_expected_text_and_keeps_lifetime_on_restart(self):
        cards, progress = self._cards()
        session = Session("deck", cards, progress)
        self.assertEqual(session.check("paris", 10), "correct")
        self.assertEqual(session.advance(""), "advanced")
        self.assertEqual(session.check("nope", 11), "wrong")
        self.assertEqual(session.session_mistakes, 1)
        self.assertEqual(session.advance("nope"), "need-correction")
        self.assertEqual(session.advance("Madrid"), "advanced")
        self.assertEqual(progress.get("deck", cards[1].key())["e"], 1)
        session.restart()
        self.assertEqual(session.session_mistakes, 0)
        self.assertEqual(progress.totals("deck"), (1, 1))
        again = ProgressStore(progress.path)
        self.assertEqual(again.totals("deck"), (1, 1))

    def test_chunk_advances_only_after_every_card_is_mastered(self):
        cards, progress = self._cards()
        session = Session("deck", cards, progress)
        session.chunk_size = 2
        session.set_mode(CHUNKING)
        self.assertEqual(session.current_index(), 0)
        session.check("Paris", 1)
        session.advance("")
        self.assertEqual(session.current_index(), 1)
        session.check("wrong", 2)
        session.advance("Madrid")
        self.assertEqual(session.current_index(), 1)
        self.assertNotIn(1, session.mastered)
        session.check("Madrid", 3)
        session.advance("")
        self.assertEqual(session.chunk_start, 2)
        self.assertEqual(session.current_index(), 2)

    def test_weighted_mode_skips_immediate_repeats_and_prefers_errors(self):
        cards, progress = self._cards()

        class Pick:
            def shuffle(self, values):
                return None

            def choices(self, population, weights, k):
                best = max(range(len(population)), key=lambda item: (weights[item], -item))
                return [population[best]]

        session = Session("deck", cards, progress, rng=Pick())
        progress.record("deck", cards[2].key(), False, 1)
        progress.record("deck", cards[2].key(), False, 2)
        session.set_mode(WEIGHTED)
        self.assertEqual(session.current_index(), 0)
        session.checked = True
        session.correction_required = False
        session.advance("")
        self.assertEqual(session.current_index(), 2)
        seen = [session.current_index()]
        for _ in range(6):
            session.checked = True
            session.correction_required = False
            session.advance("")
            seen.append(session.current_index())
        self.assertTrue(all(seen[i] != seen[i + 1] for i in range(len(seen) - 1)))
        self.assertGreater(seen.count(2), seen.count(1))

    def test_hardest_sort(self):
        cards, progress = self._cards()
        progress.record("deck", cards[0].key(), True, 1)
        progress.record("deck", cards[1].key(), False, 2)
        progress.record("deck", cards[1].key(), False, 3)
        rows = hardest_rows(cards, progress, "deck")
        self.assertEqual(rows[0]["term"], "Spain")
        self.assertEqual(rows[1]["term"], "France")
        self.assertEqual(len(rows), 2)


if __name__ == "__main__":
    unittest.main()
