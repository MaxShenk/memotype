"""Build the English dictionary used by flashcard generation.

Definitions are shortened WordNet 3.0 glosses. Frequencies are wordfreq Zipf
scores (occurrences per billion words, on a log10 scale). The app turns a
Zipf score z into "times per million words" with 10 ** (z - 3).

WordNet 3.0 Copyright 2006 by Princeton University. All rights reserved.
Frequency data is from wordfreq and may be redistributed under CC BY-SA 4.0.
See web/public/lexicon-notice.txt.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from nltk.corpus import wordnet as wn
from wordfreq import zipf_frequency

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "public" / "lexicon.json"

# Zipf 1 is one occurrence per billion words. The old floor of 2 kept words
# like "drainpipe": rare on paper, obvious in pieces. Zipf 1 reaches words
# like "pulchritude". The top stops at 6.35 so closed-class words WordNet
# defines badly stay out. "time" is 6.29 and remains.
MIN_ZIPF = 1.0
MAX_ZIPF = 6.35
WORD = re.compile(r"^[a-z]+(?:['-][a-z]+)*$")
TAXON = re.compile(r"(idae|aceae|inae|ales|formes|oidea|phyta|mycetes|mycota)$")
GLOSS_SKIP = re.compile(
    r"\b(genus|family of|order of|native or inhabitant|a city|a town|a village|capital of)\b",
    re.I,
)
# Specialist lists. A rare vocabulary deck should not be mostly species and place names.
SKIP_LEX = {"noun.animal", "noun.plant", "noun.substance", "noun.body", "noun.location", "noun.group"}
SUFFIXES = (
    "isation", "ization", "iness", "ingly", "edly", "ably", "ibly", "ally",
    "ness", "ment", "less", "ful", "able", "ible", "ish",
    "ification", "ation", "tion", "sion", "hood", "ship", "ward",
    "ing", "ed", "er", "or", "ly", "ity", "ous", "ive",
)
PREFIXES = (
    "non", "un", "re", "pre", "dis", "mis", "over", "under", "anti", "semi",
    "sub", "inter", "super", "out", "in", "im", "il", "ir", "de", "en", "co",
)


def shorten(text: str) -> str:
    text = " ".join(text.split())
    text = re.sub(r"^\([^)]{2,40}\)\s*", "", text)
    head, sep, _tail = text.partition(";")
    if sep and len(head) >= 24:
        text = head
    text = text.strip(" ;")
    if len(text) > 140:
        text = text[:137].rsplit(" ", 1)[0].rstrip(" ,;") + "..."
    if text and text[-1] not in ".!?":
        text += "."
    return text[:1].upper() + text[1:]


def sense(lemma: str):
    best = None
    best_key = None
    for index, syn in enumerate(wn.synsets(lemma.replace("-", "_"))):
        if syn.instance_hypernyms():
            continue
        count = 0
        matched = False
        for item in syn.lemmas():
            name = item.name().replace("_", "-")
            if name == lemma or item.name() == lemma:
                matched = True
                count = max(count, item.count())
        if not matched:
            continue
        # SemCor counts below 5 are too thin to override WordNet's own sense order.
        key = (count if count >= 5 else 0, -index)
        if best_key is None or key > best_key:
            best_key = key
            best = syn
    if best is None:
        return None
    gloss = shorten(best.definition())
    if len(gloss) < 8:
        return None
    lowered = gloss.lower()
    if "letter of the" in lowered and "alphabet" in lowered:
        return None
    return best.pos(), gloss, best.lexname()


def too_familiar(word: str, own: float, gloss: str, lexname: str) -> bool:
    """Drop rare-looking words a reader can unpack from a common word."""
    if own >= 3:
        return False
    if own < 2 and (len(word) < 5 or lexname in SKIP_LEX):
        return True
    if TAXON.search(word) or GLOSS_SKIP.search(gloss):
        return True
    threshold = max(2.2, own + 0.6)
    stems = _pieces(word)
    stems.extend(piece for stem in list(stems) for piece in _pieces(stem))
    for index in range(3, len(word) - 2):
        if zipf_frequency(word[:index], "en") >= 3.5 and zipf_frequency(word[index:], "en") >= 3.5:
            return True
    return any(zipf_frequency(stem, "en") >= threshold for stem in stems)


def _pieces(word: str) -> list[str]:
    stems = []
    for suffix in SUFFIXES:
        if word.endswith(suffix) and len(word) - len(suffix) >= 4:
            stem = word[: -len(suffix)]
            stems.extend([stem, stem + "e"])
            if stem.endswith("i"):
                stems.append(stem[:-1] + "y")
            if len(stem) >= 2 and stem[-1] == stem[-2]:
                stems.append(stem[:-1])
    for prefix in PREFIXES:
        if word.startswith(prefix) and len(word) - len(prefix) >= 4:
            stems.append(word[len(prefix) :])
    return stems


def main() -> None:
    rows = []
    seen = set()
    for lemma in wn.all_lemma_names():
        word = lemma.replace("_", " ")
        if " " in word or len(word) < 3 or word in seen or not WORD.match(word):
            continue
        seen.add(word)
        zipf = round(zipf_frequency(word, "en"), 2)
        if zipf < MIN_ZIPF or zipf > MAX_ZIPF:
            continue
        found = sense(word)
        if found is None:
            continue
        pos, gloss, lexname = found
        if too_familiar(word, zipf, gloss, lexname):
            continue
        rows.append([word, pos, gloss, zipf])
    rows.sort(key=lambda row: row[0])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {len(rows)} entries, {OUT.stat().st_size} bytes")
    for sample in ("time", "people", "mammoth", "serendipity", "aardvark"):
        match = next((row for row in rows if row[0] == sample), None)
        print(sample, match)


if __name__ == "__main__":
    main()
