# MemoType

Typing practice and flashcards. A flashcard deck is a JSON file you import. It is not something to wire into the app.

## New flashcard set

When asked for a new deck, do only this:

1. Copy the shape of any file in `assets/decks/`. A deck is a JSON array of `{ "term", "definition" }`. `image` and `enabled` are optional. The file name, without `.json`, becomes the deck name on import.
2. Look up the facts. Write them into that file and save it under `assets/decks/`.

Do not read the app, storage, tests, or UI to discover the format. The existing deck files are the template.
