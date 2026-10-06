import unittest

from memotype.engine import Engine, normalize


class NormalizeTests(unittest.TestCase):
    def test_newlines_quotes_and_edges(self):
        raw = "  “Hello”\r\nworld\t \n"
        self.assertEqual(normalize(raw), '"Hello"\nworld')


class PracticeTests(unittest.TestCase):
    def test_correct_mistake_backspace_and_finish(self):
        engine = Engine("a\nb", "practice")
        self.assertEqual(engine.handle_char("z", 10), "mistake")
        self.assertEqual(engine.mistakes, 1)
        self.assertEqual(engine.pos, 0)
        self.assertEqual(engine.handle_char("a", 10), "ok")
        self.assertEqual(engine.score, 1)
        engine.backspace()
        self.assertEqual(engine.pos, 0)
        self.assertEqual(engine.score, 0)
        self.assertEqual(engine.handle_char("a", 10), "ok")
        self.assertEqual(engine.handle_char("\n", 20), "ok")
        self.assertEqual(engine.score, 1)
        self.assertEqual(engine.handle_char("b", 70), "done")
        self.assertTrue(engine.finished)
        self.assertEqual(engine.score, 2)
        self.assertAlmostEqual(engine.elapsed(999), 60)
        self.assertAlmostEqual(engine.wpm(999), (3 / 5) / 1)

    def test_spaces_do_not_score(self):
        engine = Engine("a b", "practice")
        engine.handle_char("a", 1)
        engine.handle_char(" ", 2)
        self.assertEqual(engine.score, 1)
        self.assertEqual(engine.handle_char("b", 3), "done")
        self.assertEqual(engine.score, 2)


class RecallTests(unittest.TestCase):
    def test_hides_future_words_and_scores_memory(self):
        engine = Engine("alpha beta", "recall")
        self.assertEqual(engine.visible_text(), "")
        self.assertEqual(engine.current_word, "alpha")
        self.assertNotIn("beta", engine.visible_text())
        for ch, now in zip("alpha", range(5)):
            self.assertEqual(engine.handle_char(ch, now), "ok")
        self.assertEqual(engine.visible_text(), "alpha ")
        self.assertEqual(engine.current_word, "beta")
        self.assertNotIn("beta", engine.visible_text())
        self.assertEqual(engine.handle_char("b", 5), "ok")
        self.assertEqual(engine.handle_char("e", 6), "ok")
        self.assertEqual(engine.handle_char("t", 7), "ok")
        self.assertEqual(engine.handle_char("a", 8), "done")
        self.assertTrue(engine.finished)
        self.assertEqual(engine.score, 9)
        self.assertEqual(engine.visible_text(), "alpha beta")

    def test_reveal_scores_nothing_and_backspace_keeps_earlier_points(self):
        engine = Engine("ab cd", "recall")
        self.assertTrue(engine.reveal(1))
        self.assertTrue(engine.reveal(1))
        self.assertEqual(engine.reveals, 1)
        self.assertEqual(engine.handle_char("a", 2), "ok")
        self.assertEqual(engine.score, 0)
        engine.backspace()
        self.assertEqual(engine.typed, "")
        self.assertEqual(engine.score, 0)
        self.assertEqual(engine.handle_char("a", 3), "ok")
        self.assertEqual(engine.handle_char("b", 4), "ok")
        self.assertEqual(engine.current_word, "cd")
        self.assertFalse(engine.revealed)
        self.assertEqual(engine.handle_char("c", 5), "ok")
        self.assertEqual(engine.score, 1)
        engine.reveal(6)
        self.assertEqual(engine.handle_char("d", 7), "done")
        self.assertEqual(engine.score, 1)
        self.assertEqual(engine.reveals, 2)

    def test_space_between_words_is_not_a_mistake(self):
        engine = Engine("alpha beta", "recall")
        for ch in "alpha":
            engine.handle_char(ch, 1)
        self.assertEqual(engine.handle_char(" ", 2), "ignore")
        self.assertEqual(engine.handle_char(" ", 2), "ignore")
        self.assertEqual(engine.mistakes, 0)
        self.assertEqual(engine.current_word, "beta")
        self.assertEqual(engine.score, 5)
        self.assertEqual(engine.handle_char("b", 3), "ok")
        self.assertEqual(engine.handle_char(" ", 4), "mistake")
        self.assertEqual(engine.typed, "b")
        fresh = Engine("alpha beta", "recall")
        self.assertEqual(fresh.handle_char(" ", 1), "mistake")

    def test_mistake_does_not_reveal_or_advance(self):
        engine = Engine("hi", "recall")
        self.assertEqual(engine.handle_char("z", 1), "mistake")
        self.assertEqual(engine.visible_text(), "")
        self.assertEqual(engine.current_word, "hi")

    def test_punctuation_is_part_of_the_word(self):
        engine = Engine("end.", "recall")
        self.assertEqual("".join(engine.handle_char(ch, index) for ch, index in zip("end.", range(4))), "okokokdone")
        self.assertTrue(engine.finished)


if __name__ == "__main__":
    unittest.main()
