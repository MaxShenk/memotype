import { useEffect, useRef, useState } from "react";
import {
  BUILTIN_DECK_ID,
  deleteDeck,
  importDeck,
  listDecks,
  loadCards,
  loadStats,
  resetStats,
  saveStat,
  type DeckRow,
} from "../lib/db";
import {
  CHUNKING,
  type Card,
  MemoryProgress,
  STANDARD,
  Session,
  WEIGHTED,
  cardKey,
  hardestRows,
} from "../lib/flash";

type Page = "quiz" | "decks" | "progress";

export function Flash() {
  const [page, setPage] = useState<Page>("decks");
  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [deck, setDeck] = useState<DeckRow | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [progress, setProgress] = useState<MemoryProgress | null>(null);
  const [sessionKey, setSessionKey] = useState(0);
  const [error, setError] = useState("");

  async function refresh() {
    setDecks(await listDecks());
  }

  useEffect(() => {
    refresh().catch((reason: Error) => setError(reason.message));
  }, []);

  async function open(row: DeckRow) {
    const loaded = await loadCards(row.id);
    if (loaded.length === 0) {
      setError("That deck has no cards. Run web/supabase/schema.sql if this is Country capitals.");
      return;
    }
    const stats = await loadStats(row.id);
    const memory = new MemoryProgress(row.id, stats, (key, next) => {
      saveStat(row.id, key, next).catch((reason: Error) => setError(reason.message));
    });
    setDeck(row);
    setCards(loaded);
    setProgress(memory);
    setSessionKey((value) => value + 1);
    setError("");
    setPage("quiz");
  }

  return (
    <>
      <nav className="subnav">
        <button aria-pressed={page === "quiz"} onClick={() => setPage("quiz")}>Quiz</button>
        <button aria-pressed={page === "decks"} onClick={() => setPage("decks")}>Decks</button>
        <button aria-pressed={page === "progress"} onClick={() => setPage("progress")}>Progress</button>
      </nav>
      {error && <p className="bad">{error}</p>}
      {page === "decks" && (
        <Decks
          decks={decks}
          onOpen={(row) => open(row).catch((reason: Error) => setError(reason.message))}
          onImported={async (id) => {
            await refresh();
            const next = (await listDecks()).find((row) => row.id === id);
            if (next) await open(next);
          }}
          onDelete={async (row) => {
            if (!window.confirm(`Delete ${row.name}?`)) return;
            await deleteDeck(row.id);
            if (deck?.id === row.id) {
              setDeck(null);
              setCards([]);
              setProgress(null);
            }
            await refresh();
          }}
          onReset={async (row) => {
            await resetStats(row.id);
            if (deck?.id === row.id) {
              setProgress(new MemoryProgress(row.id, [], (key, next) => {
                saveStat(row.id, key, next).catch((reason: Error) => setError(reason.message));
              }));
              setSessionKey((value) => value + 1);
            }
          }}
          onCapitals={() => {
            const row = decks.find((item) => item.id === BUILTIN_DECK_ID);
            if (!row) {
              setError("Country capitals is not in the database yet. Run web/supabase/schema.sql.");
              return;
            }
            open(row).catch((reason: Error) => setError(reason.message));
          }}
        />
      )}
      {page === "quiz" && <Quiz key={`${deck?.id ?? "none"}-${sessionKey}`} deck={deck} cards={cards} progress={progress} />}
      {page === "progress" && (
        <Progress
          deck={deck}
          cards={cards}
          progress={progress}
          onReset={deck ? async () => {
            await resetStats(deck.id);
            setProgress(new MemoryProgress(deck.id, [], (key, next) => {
              saveStat(deck.id, key, next).catch((reason: Error) => setError(reason.message));
            }));
            setSessionKey((value) => value + 1);
          } : undefined}
        />
      )}
    </>
  );
}

function Decks({
  decks,
  onOpen,
  onImported,
  onDelete,
  onReset,
  onCapitals,
}: {
  decks: DeckRow[];
  onOpen: (row: DeckRow) => void;
  onImported: (id: string) => Promise<void>;
  onDelete: (row: DeckRow) => Promise<void>;
  onReset: (row: DeckRow) => Promise<void>;
  onCapitals: () => void;
}) {
  const [message, setMessage] = useState("");

  return (
    <section className="list">
      <div className="actions">
        <button className="primary" onClick={onCapitals}>Country capitals</button>
      </div>
      <label>
        Import a JSON deck
        <input
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            file.text().then(async (text) => {
              const raw = JSON.parse(text) as unknown;
              const id = await importDeck(file.name.replace(/\.json$/i, ""), raw);
              setMessage(`Loaded ${file.name}`);
              await onImported(id);
            }).catch((reason: Error) => setMessage(reason.message));
          }}
        />
      </label>
      {message && <p className="muted">{message}</p>}
      {decks.map((row) => (
        <article className="card item" key={row.id}>
          <strong>{row.name}</strong>
          <span className="faint">{row.builtin_key ? "Built-in" : "Your deck"}</span>
          <div className="actions">
            <button className="primary" onClick={() => onOpen(row)}>Quiz</button>
            <button onClick={() => onReset(row).catch((reason: Error) => setMessage(reason.message))}>Reset progress</button>
            {!row.builtin_key && <button className="bad" onClick={() => onDelete(row).catch((reason: Error) => setMessage(reason.message))}>Delete</button>}
          </div>
        </article>
      ))}
    </section>
  );
}

function Quiz({ deck, cards, progress }: { deck: DeckRow | null; cards: Card[]; progress: MemoryProgress | null }) {
  const sessionRef = useRef<Session | null>(null);
  const timer = useRef<number | null>(null);
  const [tick, setTick] = useState(0);
  const [answer, setAnswer] = useState("");
  const [sticky, setSticky] = useState(false);
  const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  if (deck && progress && cards.length && sessionRef.current?.deckId !== deck.id) {
    sessionRef.current = new Session(deck.id, cards, progress);
  }
  const session = sessionRef.current;

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  function bump() {
    setTick((value) => value + 1);
  }

  function cancelAdvance() {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  }

  if (!session || !deck) {
    return <section className="card"><p>Load a deck to begin.</p></section>;
  }

  function check() {
    if (!session || session.checked) return;
    setNotice("");
    setSticky(false);
    const outcome = session.check(answer, Date.now());
    if (outcome === "correct") {
      cancelAdvance();
      timer.current = window.setTimeout(() => {
        session.advance("");
        setAnswer("");
        setSticky(true);
        bump();
        inputRef.current?.focus();
      }, 350);
    } else {
      cancelAdvance();
      setAnswer("");
    }
    bump();
  }

  function next() {
    if (!session || !session.checked) return;
    if (session.correctionRequired && !session.matches(answer)) {
      setNotice("Type the expected answer to continue.");
      bump();
      return;
    }
    cancelAdvance();
    session.advance(answer);
    setSticky(false);
    setNotice("");
    setAnswer("");
    bump();
    inputRef.current?.focus();
  }

  const finish = session.mode === STANDARD && session.cursor >= session.order.length - 1;
  const canNext = session.checked && (!session.correctionRequired || session.matches(answer));
  const reveal = !session.showingTerm() && session.currentCard().image ? session.currentCard().image : "";
  void tick;

  return (
    <section className="stage">
      <div className="stats">
        <span>{deck.name}</span>
        <span>{session.positionLabel()}</span>
        <span>Mistakes {session.sessionMistakes}</span>
      </div>
      <div className="row">
        {([
          [STANDARD, "Standard"],
          [CHUNKING, "Chunking"],
          [WEIGHTED, "Weighted"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            aria-pressed={session.mode === value}
            onClick={() => {
              cancelAdvance();
              session.setMode(value);
              setAnswer("");
              setSticky(false);
              bump();
            }}
          >
            {label}
          </button>
        ))}
        <label>
          Chunk
          <input
            type="number"
            min={1}
            value={session.chunkSize}
            disabled={session.mode !== CHUNKING}
            onChange={(event) => {
              const size = Number(event.target.value);
              if (!Number.isFinite(size) || size < 1) return;
              cancelAdvance();
              session.setChunkSize(size);
              setAnswer("");
              bump();
            }}
          />
        </label>
        <button onClick={() => { cancelAdvance(); session.setStartWithTerm(!session.startWithTerm); setAnswer(""); setSticky(false); bump(); }}>
          {session.startWithTerm ? "Term → definition" : "Definition → term"}
        </button>
        <button onClick={() => { cancelAdvance(); session.setShuffle(!session.shuffle); setAnswer(""); setSticky(false); bump(); }}>
          {session.shuffle ? "Shuffle on" : "Shuffle off"}
        </button>
        <button onClick={() => { cancelAdvance(); session.restart(); setAnswer(""); setSticky(false); bump(); }}>Restart</button>
      </div>
      <article className="card prompt">
        <p className="muted">{session.showingTerm() ? "TERM" : "DEFINITION"}</p>
        <div className="prompt-body">
          {session.promptImage() && (
            <div className="frame">
              <img src={session.promptImage()} alt="" />
            </div>
          )}
          <div>{session.promptText() || "Picture"}</div>
        </div>
      </article>
      <div className="card answer">
        <label>
          {session.showingTerm() ? "Type the definition" : "Type the term"}
          <input
            ref={inputRef}
            value={answer}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            disabled={session.checked && session.wasCorrect}
            onChange={(event) => setAnswer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (!session.checked) check();
                else next();
              }
            }}
          />
        </label>
        <div className="actions">
          <button className="primary" onClick={check} disabled={session.checked}>Check</button>
          <button onClick={next} disabled={!canNext}>{finish ? "Finish" : "Next"}</button>
        </div>
        {notice && <p className="bad">{notice}</p>}
      </div>
      <div className="result">
        {(session.checked || sticky) && (
          <div className={session.wasCorrect || sticky ? "banner ok" : "banner miss"}>
            <strong className={session.wasCorrect || (sticky && !session.checked) ? "good" : "bad"}>
              {session.wasCorrect || (sticky && !session.checked) ? "Correct" : "Not quite"}
            </strong>
            {session.checked && !session.wasCorrect && <p>Expected: {session.expectedText()}</p>}
            {session.checked && !session.wasCorrect && reveal && (
              <div className="frame"><img src={reveal} alt="" /></div>
            )}
            {session.checked && !session.wasCorrect && <p className="muted">Type the expected answer to continue.</p>}
          </div>
        )}
      </div>
    </section>
  );
}

function Progress({
  deck,
  cards,
  progress,
  onReset,
}: {
  deck: DeckRow | null;
  cards: Card[];
  progress: MemoryProgress | null;
  onReset?: () => Promise<void>;
}) {
  if (!deck || !progress) return <section className="card"><p>Load a deck to see progress.</p></section>;
  const [corrects, errors] = progress.totals();
  const attempts = corrects + errors;
  const accuracy = attempts === 0 ? 0 : Math.round((corrects / attempts) * 100);
  const rows = hardestRows(cards, progress, deck.id);
  return (
    <section className="card">
      <div className="stats">
        <span>Accuracy {accuracy}%</span>
        <span>Correct {corrects}</span>
        <span>Errors {errors}</span>
      </div>
      <h2>Hardest cards</h2>
      {rows.length === 0 && <p className="muted">No stats yet. Start practicing.</p>}
      {rows.map((row) => (
        <div className="score-line" key={cardKey({ term: row.term, definition: row.definition, image: "" }) + row.index}>
          <span>{row.index}</span>
          <span>{row.term} · {row.definition}</span>
          <span>E {row.e} C {row.c} {Math.round(row.accuracy * 100)}%</span>
        </div>
      ))}
      {onReset && <button onClick={() => onReset()}>Reset progress</button>}
    </section>
  );
}
