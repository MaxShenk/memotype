import { useEffect, useRef, useState } from "react";
import {
  deleteDeck,
  importDeck,
  listDecks,
  loadCards,
  loadStats,
  replaceDeck,
  resetStats,
  saveDeck,
  saveStat,
  sanitizeName,
  type DeckRow,
} from "../lib/db";
import {
  CHUNKING,
  type Card,
  type PracticePrefs,
  cardEnabled,
  MemoryProgress,
  STANDARD,
  Session,
  WEIGHTED,
  cardKey,
  hardestRows,
} from "../lib/flash";
import {
  clearDeckPractice,
  clearPlace,
  loadGlobalPractice,
  loadPlace,
  loadPractice,
  saveDeckPractice,
  saveGlobalPractice,
  savePlace,
} from "../lib/prefs";

type Page = "quiz" | "decks" | "progress" | "import";

const SAMPLE_DECK = `[
  {
    "term": "Feature",
    "definition": "An input the model uses to make a prediction"
  },
  {
    "term": "Label",
    "definition": "The outcome a supervised model is trained to predict",
    "image": "https://example.com/label.png"
  }
]
`;

function downloadSample() {
  const blob = new Blob([SAMPLE_DECK], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sample-deck.json";
  link.click();
  URL.revokeObjectURL(url);
}

export function Flash() {
  const [page, setPage] = useState<Page>("decks");
  const [backTo, setBackTo] = useState<Page>("decks");
  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [deck, setDeck] = useState<DeckRow | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [progress, setProgress] = useState<MemoryProgress | null>(null);
  const [sessionKey, setSessionKey] = useState(0);
  const [launch, setLaunch] = useState<"resume" | "restart">("resume");
  const [error, setError] = useState("");

  async function refresh() {
    setDecks(await listDecks());
  }

  useEffect(() => {
    refresh().catch((reason: Error) => setError(reason.message));
  }, []);

  async function open(row: DeckRow, how: "resume" | "restart" = "resume") {
    const loaded = await loadCards(row.id);
    if (loaded.length === 0) {
      setError("That deck has no cards. Run web/supabase/schema.sql if this is Country capitals.");
      return;
    }
    const stats = await loadStats(row.id);
    const memory = new MemoryProgress(row.id, stats, (key, next) => {
      saveStat(row.id, key, next).catch((reason: Error) => setError(reason.message));
    });
    if (how === "restart") clearPlace(row.id);
    setDeck(row);
    setCards(loaded);
    setProgress(memory);
    setLaunch(how);
    setSessionKey((value) => value + 1);
    setError("");
    setBackTo("decks");
    setPage("quiz");
  }

  function showProgress() {
    setBackTo(page === "quiz" ? "quiz" : "decks");
    setPage("progress");
  }

  function goBack() {
    if (page === "progress") {
      setPage(backTo);
      return;
    }
    setBackTo("decks");
    setPage("decks");
  }

  const backLabel = page === "progress" && backTo === "quiz" && deck ? deck.name : "Decks";

  return (
    <>
      <div className="crumb-bar">
        <div className="crumb-trail">
          {page === "decks" ? (
            <span className="crumb-current">Decks</span>
          ) : (
            <button type="button" className="crumb-back" onClick={goBack}>
              <span aria-hidden="true">←</span> {backLabel}
            </button>
          )}
          {page === "quiz" && deck && (
            <>
              <span className="crumb-sep">/</span>
              <span className="crumb-current">{deck.name}</span>
            </>
          )}
          {page === "progress" && (
            <>
              <span className="crumb-sep">/</span>
              <span className="crumb-current">Progress</span>
            </>
          )}
          {page === "import" && (
            <>
              <span className="crumb-sep">/</span>
              <span className="crumb-current">Import</span>
            </>
          )}
        </div>
        {(page === "decks") && (
          <div className="crumb-pin">
            <button type="button" className="icon-button" aria-label="Progress" onClick={showProgress}>
              <PodiumIcon />
            </button>
            <button type="button" className="icon-button" aria-label="Import a JSON deck" onClick={() => { setBackTo("decks"); setPage("import"); }}>
              <UploadIcon />
            </button>
          </div>
        )}
      </div>
      {error && <p className="bad">{error}</p>}
      {page === "decks" && (
        <Decks
          decks={decks}
          onOpen={(row, how) => open(row, how).catch((reason: Error) => setError(reason.message))}
          onCardsChanged={async (id) => {
            await refresh();
            if (deck?.id !== id) return;
            const row = (await listDecks()).find((item) => item.id === id);
            const loaded = await loadCards(id);
            if (!row || loaded.length === 0) return;
            const stats = await loadStats(id);
            setDeck(row);
            setCards(loaded);
            setProgress(new MemoryProgress(row.id, stats, (key, next) => {
              saveStat(row.id, key, next).catch((reason: Error) => setError(reason.message));
            }));
            setSessionKey((value) => value + 1);
          }}
          onDelete={async (row) => {
            if (!window.confirm(`Delete ${row.name}?`)) return;
            await deleteDeck(row.id);
            clearPlace(row.id);
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
        />
      )}
      {page === "import" && (
        <ImportDeck
          decks={decks}
          onImported={async (id) => {
            await refresh();
            const next = (await listDecks()).find((row) => row.id === id);
            if (next) await open(next);
          }}
        />
      )}
      {page === "quiz" && <Quiz key={`${deck?.id ?? "none"}-${sessionKey}`} deck={deck} cards={cards} progress={progress} launch={launch} onProgress={showProgress} />}
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

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  const path = direction === "left" ? "M14.5 6 8.5 12l6 6" : "M9.5 6l6 6-6 6";
  return (
    <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function OptionsIcon() {
  return (
    <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
      <circle cx="9" cy="7" r="2.2" />
      <circle cx="15" cy="12" r="2.2" />
      <circle cx="8" cy="17" r="2.2" />
    </svg>
  );
}

function PodiumIcon() {
  return (
    <svg className="glyph podium" viewBox="0 0 36 24" aria-hidden="true">
      <rect x="0" y="10" width="11" height="14" rx="2" />
      <rect x="12.5" y="2" width="11" height="22" rx="2" />
      <rect x="25" y="14" width="11" height="10" rx="2" />
      <text x="5.5" y="20" textAnchor="middle">2</text>
      <text x="18" y="15" textAnchor="middle">1</text>
      <text x="30.5" y="21.5" textAnchor="middle">3</text>
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 16V4" />
      <path d="M7 8.5 12 3.5 17 8.5" />
      <path d="M4 15.5V20h16v-4.5" />
    </svg>
  );
}

function ImportDeck({
  decks,
  onImported,
}: {
  decks: DeckRow[];
  onImported: (id: string) => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  return (
    <section className="card import-screen">
      <h2>Import a deck</h2>
      <p>
        Choose a JSON file. The file name, without .json, becomes the deck name. The file itself is an array of cards.
        Every card needs a definition, and either a term or an image. An image is an https URL or a data:image URI.
        enabled is optional and defaults to on. Importing a file whose name matches a deck you already have replaces that deck’s cards.
      </p>
      <p className="muted">Sample format</p>
      <pre className="snippet">{SAMPLE_DECK}</pre>
      <div className="actions">
        <button type="button" onClick={downloadSample}>Download sample</button>
        <label className="file-button primary">
          Choose JSON file
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              const clean = sanitizeName(file.name.replace(/\.json$/i, ""));
              const match = decks.find((row) => !row.builtin_key && row.name.toLowerCase() === clean.toLowerCase());
              if (match && !window.confirm(`Replace the cards in ${match.name}?`)) return;
              file.text().then(async (text) => {
                const result = await importDeck(clean, JSON.parse(text) as unknown);
                setError("");
                setMessage(result.updated ? `Updated ${clean}` : `Loaded ${clean}`);
                await onImported(result.id);
              }).catch((reason: Error) => {
                setMessage("");
                setError(reason.message);
              });
            }}
          />
        </label>
      </div>
      {message && <p className="good">{message}</p>}
      {error && <p className="bad">{error}</p>}
    </section>
  );
}

function Decks({
  decks,
  onOpen,
  onCardsChanged,
  onDelete,
  onReset,
}: {
  decks: DeckRow[];
  onOpen: (row: DeckRow, how?: "resume" | "restart") => void;
  onCardsChanged: (id: string) => Promise<void>;
  onDelete: (row: DeckRow) => Promise<void>;
  onReset: (row: DeckRow) => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<DeckRow | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftCards, setDraftCards] = useState<Card[]>([]);

  async function readJson(file: File): Promise<unknown> {
    return JSON.parse(await file.text()) as unknown;
  }

  function startEdit(row: DeckRow) {
    loadCards(row.id).then((loaded) => {
      setEditing(row);
      setDraftName(row.name);
      setDraftCards(loaded.map((card) => ({ ...card })));
      setMessage("");
    }).catch((reason: Error) => setMessage(reason.message));
  }

  if (editing) {
    return (
      <DeckEditor
        name={draftName}
        cards={draftCards}
        onName={setDraftName}
        onCards={setDraftCards}
        onCancel={() => setEditing(null)}
        onSave={() => {
          saveDeck(editing.id, draftName, draftCards).then(async () => {
            setMessage(`Saved ${sanitizeName(draftName)}`);
            setEditing(null);
            await onCardsChanged(editing.id);
          }).catch((reason: Error) => setMessage(reason.message));
        }}
        message={message}
      />
    );
  }

  return (
    <section className="list">
      {message && <p className="muted">{message}</p>}
      {decks.length === 0 && <p className="muted">No decks yet. Use the upload button to import a JSON file.</p>}
      {decks.map((row) => {
        const place = loadPlace(row.id);
        return (
        <article className="card item" key={row.id}>
          <button type="button" className="deck-open" onClick={() => onOpen(row, "resume")}>
            <span>
              <strong>{row.name}</strong>
              <span className="faint">{row.builtin_key ? "Built-in" : "Your deck"}{place ? ` · Card ${place}` : ""}</span>
            </span>
            <span className="deck-chevron" aria-hidden="true">›</span>
          </button>
          <div className="actions">
            {place && <button className="primary" onClick={() => onOpen(row, "resume")}>Resume</button>}
            {place && <button onClick={() => onOpen(row, "restart")}>Restart</button>}
            {!row.builtin_key && <button onClick={() => startEdit(row)}>Edit</button>}
            {!row.builtin_key && (
              <label className="file-button">
                Update from JSON
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    if (!window.confirm(`Replace the cards in ${row.name}?`)) return;
                    readJson(file).then(async (raw) => {
                      await replaceDeck(row.id, raw);
                      setMessage(`Updated ${row.name}`);
                      await onCardsChanged(row.id);
                    }).catch((reason: Error) => setMessage(reason.message));
                  }}
                />
              </label>
            )}
            <button onClick={() => onReset(row).catch((reason: Error) => setMessage(reason.message))}>Reset progress</button>
            {!row.builtin_key && <button className="bad" onClick={() => onDelete(row).catch((reason: Error) => setMessage(reason.message))}>Delete</button>}
          </div>
        </article>
        );
      })}
    </section>
  );
}

function DeckEditor({
  name,
  cards,
  message,
  onName,
  onCards,
  onSave,
  onCancel,
}: {
  name: string;
  cards: Card[];
  message: string;
  onName: (name: string) => void;
  onCards: (cards: Card[]) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  function update(index: number, patch: Partial<Card>) {
    onCards(cards.map((card, item) => (item === index ? { ...card, ...patch } : card)));
  }

  const playing = cards.filter((card) => cardEnabled(card)).length;

  return (
    <section className="list deck-editor">
      <label>
        Deck name
        <input value={name} onChange={(event) => onName(event.target.value)} />
      </label>
      <p className="muted">{playing} of {cards.length} in rotation. Turned-off cards stay in the deck.</p>
      {cards.map((card, index) => (
        <article className={cardEnabled(card) ? "card item" : "card item off"} key={index}>
          <div className="card-head">
            <strong>Card {index + 1}</strong>
            <label className="pick">
              <input
                type="checkbox"
                checked={cardEnabled(card)}
                onChange={(event) => update(index, { enabled: event.target.checked })}
              />
              In rotation
            </label>
          </div>
          <label>
            Term
            <input value={card.term} onChange={(event) => update(index, { term: event.target.value })} />
          </label>
          <label>
            Definition
            <textarea value={card.definition} onChange={(event) => update(index, { definition: event.target.value })} />
          </label>
          <button className="bad" onClick={() => onCards(cards.filter((_, item) => item !== index))}>Remove card</button>
        </article>
      ))}
      <div className="actions">
        <button onClick={() => onCards([...cards, { term: "", definition: "", image: "", enabled: true }])}>Add card</button>
        <button className="primary" onClick={onSave}>Save</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
      {message && <p className="bad">{message}</p>}
    </section>
  );
}

function Quiz({ deck, cards, progress, launch, onProgress }: { deck: DeckRow | null; cards: Card[]; progress: MemoryProgress | null; launch: "resume" | "restart"; onProgress: () => void }) {
  const sessionRef = useRef<Session | null>(null);
  const timer = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);
  const [answer, setAnswer] = useState("");
  const [notice, setNotice] = useState("");
  const [jump, setJump] = useState("");
  const [custom, setCustom] = useState(false);
  const [pagerOpen, setPagerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusAnswer = useRef(false);

  const activeCount = cards.filter((card) => cardEnabled(card)).length;
  if (deck && progress && cards.length && activeCount > 0 && sessionRef.current?.deckId !== deck.id) {
    const loaded = loadPractice(deck.id);
    const next = new Session(deck.id, cards, progress, undefined, loaded.prefs);
    if (launch === "resume") {
      const place = loadPlace(deck.id);
      if (place) next.jumpTo(place);
    }
    sessionRef.current = next;
    if (custom !== loaded.custom) setCustom(loaded.custom);
  }
  const session = sessionRef.current;

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (!deck || !session) return;
    savePlace(deck.id, session.currentIndex() + 1);
  }, [deck, session, tick]);

  useEffect(() => {
    if (!focusAnswer.current) return;
    const field = inputRef.current;
    if (!field || field.disabled || field.readOnly) return;
    focusAnswer.current = false;
    field.focus();
  }, [tick]);

  useEffect(() => {
    if (!pagerOpen && !settingsOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setPagerOpen(false);
      setSettingsOpen(false);
    }
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (pagerOpen && !menuRef.current?.contains(target)) setPagerOpen(false);
      if (settingsOpen && !settingsRef.current?.contains(target)) setSettingsOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [pagerOpen, settingsOpen]);

  function bump() {
    setTick((value) => value + 1);
  }

  function cancelAdvance() {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  }

  if (!session || !deck) {
    if (deck && cards.length > 0 && activeCount === 0) {
      return <section className="card"><p>Every card in {deck.name} is turned off. Open the deck editor and turn at least one back on.</p></section>;
    }
    return <section className="card"><p>Load a deck to begin.</p></section>;
  }

  function goToCard() {
    const number = Number(jump);
    const result = session?.jumpTo(number);
    cancelAdvance();
    if (result === "ok") {
      setNotice("");
      setAnswer("");
      focusAnswer.current = true;
      inputRef.current?.focus();
      bump();
      return;
    }
    if (result === "off") setNotice(`Card ${number} is turned off.`);
    else setNotice(`Enter a card from 1 to ${session?.cards.length ?? 0}.`);
    bump();
  }

  function prefsFrom(): PracticePrefs {
    return {
      mode: session?.mode ?? STANDARD,
      chunkSize: session?.chunkSize ?? 10,
      shuffle: session?.shuffle ?? false,
      startWithTerm: session?.startWithTerm ?? true,
    };
  }

  function remember() {
    if (!deck || !session) return;
    const prefs = prefsFrom();
    if (custom) saveDeckPractice(deck.id, prefs);
    else saveGlobalPractice(prefs);
  }

  function tune(change: () => void) {
    if (!session) return;
    cancelAdvance();
    change();
    remember();
    setAnswer("");
    setNotice("");
    bump();
  }

  function followGlobal() {
    if (!deck || !session) return;
    clearDeckPractice(deck.id);
    cancelAdvance();
    session.applyPractice(loadGlobalPractice());
    setCustom(false);
    setAnswer("");
    setNotice("");
    bump();
  }

  function followDeck() {
    if (!deck || !session) return;
    saveDeckPractice(deck.id, prefsFrom());
    setCustom(true);
  }

  function restartRun() {
    if (!deck || !session) return;
    cancelAdvance();
    clearPlace(deck.id);
    session.restart();
    setAnswer("");
    setNotice("");
    setJump("");
    bump();
  }

  function pageBy(delta: number) {
    if (!session) return;
    cancelAdvance();
    if (session.step(delta) !== "ok") return;
    setNotice("");
    setAnswer("");
    setJump("");
    focusAnswer.current = true;
    bump();
  }

  function check() {
    if (!session || session.checked) return;
    setNotice("");
    const outcome = session.check(answer, Date.now());
    if (outcome === "correct") {
      cancelAdvance();
      timer.current = window.setTimeout(() => {
        session.advance("");
        setAnswer("");
        focusAnswer.current = true;
        bump();
      }, 650);
    }
    bump();
  }

  function continueAfterMiss() {
    if (!session || !session.checked || session.wasCorrect) return;
    cancelAdvance();
    session.advance(session.expectedText());
    setNotice("");
    setAnswer("");
    focusAnswer.current = true;
    bump();
  }

  const reveal = !session.showingTerm() && session.currentCard().image ? session.currentCard().image : "";
  void tick;

  return (
    <section className="stage">
      <div className="stats quiz-bar" ref={settingsRef}>
        <span>{deck.name}</span>
        <span>{session.positionLabel()}</span>
        <span>Mistakes {session.sessionMistakes}</span>
        <div className="icon-pair">
          <button type="button" className="icon-button" aria-label="Progress" onClick={onProgress}>
            <PodiumIcon />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-expanded={settingsOpen}
            aria-label={settingsOpen ? "Close practice options" : "Practice options"}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <OptionsIcon />
          </button>
        </div>
        {settingsOpen && (
          <div className="quiz-menu">
            <div className="mode-row">
              <button type="button" aria-pressed={!custom} onClick={followGlobal}>Default</button>
              <button type="button" aria-pressed={custom} onClick={followDeck}>This deck</button>
            </div>
            <p className="muted">{custom ? "Only this deck uses these settings." : "Decks use these settings unless one has its own."}</p>
            <div className="mode-row">
              {([
                [STANDARD, "Standard"],
                [CHUNKING, "Chunking"],
                [WEIGHTED, "Weighted"],
              ] as const).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={session.mode === value} onClick={() => tune(() => session.setMode(value))}>{label}</button>
              ))}
            </div>
            <label>
              Chunk
              <input
                type="number"
                min={1}
                value={session.chunkSize}
                onChange={(event) => {
                  const size = Number(event.target.value);
                  if (!Number.isFinite(size) || size < 1) return;
                  tune(() => session.setChunkSize(size));
                }}
              />
            </label>
            <button type="button" onClick={() => tune(() => session.setStartWithTerm(!session.startWithTerm))}>
              {session.startWithTerm ? "Term → definition" : "Definition → term"}
            </button>
            <button type="button" aria-pressed={session.shuffle} onClick={() => tune(() => session.setShuffle(!session.shuffle))}>
              {session.shuffle ? "Shuffle on" : "Shuffle off"}
            </button>
            <button type="button" onClick={restartRun}>Restart</button>
          </div>
        )}
      </div>
      <article className="card prompt">
        {session.checked && (
          <div className={session.wasCorrect ? "verdict ok" : "verdict miss"} aria-live="polite">
            <span className="verdict-mark" aria-hidden="true">{session.wasCorrect ? "✓" : "✕"}</span>
            <span>{session.wasCorrect ? "Correct" : session.expectedText()}</span>
            {!session.wasCorrect && reveal && <img src={reveal} alt="" />}
          </div>
        )}
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
            readOnly={session.checked && session.wasCorrect}
            onChange={(event) => setAnswer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                if (!session.checked) check();
                else continueAfterMiss();
              }
            }}
          />
        </label>
        <div className="actions">
          <button type="button" className="primary" onClick={check} disabled={session.checked}>Check</button>
        </div>
        {notice && <p className="bad">{notice}</p>}
      </div>
      {pagerOpen && <button type="button" className="sheet-backdrop" aria-label="Close card jump" onClick={() => setPagerOpen(false)} />}
      <div className="sheet-dock" ref={menuRef}>
        {pagerOpen && (
          <div className="quiz-sheet pager-sheet" id="card-jump">
            <div className="pager">
              <button type="button" className="icon-button" aria-label="Previous card" disabled={!session.canStep(-1)} onClick={() => pageBy(-1)}>
                <ArrowIcon direction="left" />
              </button>
              <div className="pager-center">
                <label>
                  Go to card
                  <input
                    type="number"
                    min={1}
                    max={session.cards.length}
                    inputMode="numeric"
                    value={jump}
                    onChange={(event) => setJump(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        goToCard();
                      }
                    }}
                  />
                </label>
                <button type="button" onClick={goToCard}>Go</button>
              </div>
              <button type="button" className="icon-button" aria-label="Next card" disabled={!session.canStep(1)} onClick={() => pageBy(1)}>
                <ArrowIcon direction="right" />
              </button>
            </div>
          </div>
        )}
        <button
          type="button"
          className="sheet-handle"
          aria-expanded={pagerOpen}
          aria-controls="card-jump"
          aria-label={pagerOpen ? "Close card jump" : "Go to card"}
          onClick={() => setPagerOpen((open) => !open)}
        >
          <span className={pagerOpen ? "sheet-chevron down" : "sheet-chevron"} />
        </button>
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
  if (!deck || !progress) return <section className="card"><p>Open a deck to see progress.</p></section>;
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
