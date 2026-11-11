import { useEffect, useRef, useState } from "react";
import { useAppChrome } from "../App";
import { deleteSource, ensureSample, listScores, listSources, recordScore, saveSource, type ScoreRow, type SourceRow } from "../lib/db";
import { Engine, PRACTICE, RECALL, scoreMode, stanzasOf } from "../lib/engine";
import { clearTypingPlace, loadTypingPlace, saveTypingPlace } from "../lib/typingPlace";

type Page = "library" | "edit" | "game" | "scores" | "import";

const SAMPLE_PASSAGE = `The quick brown fox jumps over the lazy dog.
Pack my box with five dozen liquor jugs.`;

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function clock(seconds: number): string {
  const whole = Math.floor(seconds);
  const tenths = Math.floor((seconds - whole) * 10);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}.${tenths}`;
}

function shuffleSources(items: SourceRow[]): SourceRow[] {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const item = next[index];
    next[index] = next[swap];
    next[swap] = item;
  }
  return next;
}

function downloadSample() {
  const blob = new Blob([SAMPLE_PASSAGE], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sample-passage.txt";
  link.click();
  URL.revokeObjectURL(url);
}

export function Typing() {
  const { setGameOpen } = useAppChrome();
  const [page, setPage] = useState<Page>("library");
  const [backTo, setBackTo] = useState<Page>("library");
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<SourceRow | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shuffleOn, setShuffleOn] = useState(false);
  const [run, setRun] = useState(0);
  const [fresh, setFresh] = useState(false);
  const [playing, setPlaying] = useState<{ sources: SourceRow[]; index: number; mode: string; stanzas: boolean } | null>(null);

  function begin(mode: string, list: SourceRow[], options: { shuffle?: boolean; fresh?: boolean; stanzas?: boolean } = {}) {
    if (list.length === 0) return;
    if (options.fresh) list.forEach((source) => clearTypingPlace(source.id));
    setFresh(Boolean(options.fresh));
    setRun((value) => value + 1);
    setPlaying({ sources: options.shuffle ? shuffleSources(list) : list, index: 0, mode, stanzas: Boolean(options.stanzas) });
    setBackTo("library");
    setPage("game");
  }

  async function refresh() {
    await ensureSample();
    setSources(await listSources());
  }

  useEffect(() => {
    refresh().catch((reason: Error) => setError(reason.message));
  }, []);

  useEffect(() => {
    setGameOpen(page === "game");
    return () => setGameOpen(false);
  }, [page, setGameOpen]);

  function showScores() {
    setBackTo(page === "game" ? "game" : "library");
    setPage("scores");
  }

  function exitGame() {
    setBackTo("library");
    setPage("library");
  }

  function goBack() {
    if (page === "game") {
      exitGame();
      return;
    }
    if (backTo === "game") setBackTo("library");
    setPage(backTo);
  }

  const backLabel = backTo === "game" && playing ? playing.sources[playing.index]?.name ?? "Library" : "Library";

  return (
    <>
      <div className="crumb-bar">
        <div className="crumb-trail">
          {page === "library" ? (
            <span className="crumb-current">Library</span>
          ) : (
            <button
              type="button"
              className="crumb-back"
              onClick={goBack}
              onPointerUp={(event) => {
                if (event.pointerType !== "touch" || event.button !== 0) return;
                event.preventDefault();
                goBack();
              }}
            >
              <span aria-hidden="true">←</span> {backLabel}
            </button>
          )}
          {page === "game" && playing && (
            <>
              <span className="crumb-sep">/</span>
              <span className="crumb-current">{playing.sources[playing.index]?.name}</span>
            </>
          )}
          {page === "edit" && (
            <>
              <span className="crumb-sep">/</span>
              <span className="crumb-current">{editing ? editing.name : "New source"}</span>
            </>
          )}
          {page === "scores" && (
            <>
              <span className="crumb-sep">/</span>
              <span className="crumb-current">High scores</span>
            </>
          )}
          {page === "import" && (
            <>
              <span className="crumb-sep">/</span>
              <span className="crumb-current">Import</span>
            </>
          )}
        </div>
        {page === "library" && (
          <div className="crumb-pin">
            <button type="button" className="icon-button" aria-label="New passage" onClick={() => { setEditing(null); setBackTo("library"); setPage("edit"); }}>
              <PlusIcon />
            </button>
            <button type="button" className="icon-button" aria-label="High scores" onClick={showScores}>
              <PodiumIcon />
            </button>
            <button type="button" className="icon-button" aria-label="Import a text file" onClick={() => { setBackTo("library"); setPage("import"); }}>
              <UploadIcon />
            </button>
          </div>
        )}
      </div>
      {error && <p className="bad">{error}</p>}
      {page === "library" && (
        <Library
          sources={sources}
          selected={selected}
          shuffleOn={shuffleOn}
          onToggle={(id) => {
            setSelected((current) => {
              const next = new Set(current);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            });
          }}
          onToggleAll={() => {
            setSelected((current) => current.size === sources.length ? new Set() : new Set(sources.map((source) => source.id)));
          }}
          onShuffle={() => setShuffleOn((value) => !value)}
          onOpen={(source) => {
            const saved = loadTypingPlace(source.id);
            const mode = saved?.mode === RECALL ? RECALL : PRACTICE;
            begin(mode, [source], { stanzas: typeof saved?.stanza === "number" });
          }}
          onRestart={(source) => begin(PRACTICE, [source], { fresh: true })}
          onQueue={(mode, stanzas) => begin(mode, sources.filter((source) => selected.has(source.id)), { shuffle: shuffleOn, fresh: true, stanzas })}
          onEdit={(source) => { setEditing(source); setBackTo("library"); setPage("edit"); }}
          onNew={() => { setEditing(null); setBackTo("library"); setPage("edit"); }}
          onDelete={async (source) => {
            if (!window.confirm(`Delete ${source.name}?`)) return;
            await deleteSource(source.id);
            clearTypingPlace(source.id);
            await refresh();
          }}
        />
      )}
      {page === "import" && (
        <ImportText
          onImported={async (file) => {
            const text = await file.text();
            await saveSource({ name: file.name.replace(/\.[^.]+$/, ""), body: text });
            await refresh();
            setPage("library");
          }}
        />
      )}
      {page === "edit" && (
        <Editor
          key={editing?.id ?? "new"}
          source={editing}
          onCancel={() => setPage("library")}
          onSave={async (name, body) => {
            await saveSource({ id: editing?.id, name, body });
            await refresh();
            setPage("library");
          }}
        />
      )}
      {page === "game" && playing && (
        <Game
          key={`${playing.sources[playing.index]?.id ?? "none"}-${run}`}
          source={playing.sources[playing.index]}
          mode={playing.mode}
          stanzas={playing.stanzas}
          fresh={fresh}
          place={playing.index + 1}
          total={playing.sources.length}
          nextName={playing.sources[(playing.index + 1) % playing.sources.length].name}
          onAdvance={() => {
            setFresh(false);
            setRun((value) => value + 1);
            setPlaying((current) => current ? { ...current, index: (current.index + 1) % current.sources.length } : current);
          }}
          onJump={(index) => {
            setFresh(false);
            setRun((value) => value + 1);
            setPlaying((current) => current ? { ...current, index } : current);
          }}
          onMode={(mode) => setPlaying((current) => current ? { ...current, mode } : current)}
          onStanzas={(stanzas) => setPlaying((current) => current ? { ...current, stanzas } : current)}
          onScores={showScores}
          onBack={exitGame}
          onRestart={() => {
            const source = playing.sources[playing.index];
            if (!source) return;
            clearTypingPlace(source.id);
            setFresh(true);
            setRun((value) => value + 1);
          }}
        />
      )}
      {page === "scores" && <Scores sources={sources} />}
    </>
  );
}

function Library({
  sources,
  selected,
  shuffleOn,
  onToggle,
  onToggleAll,
  onShuffle,
  onOpen,
  onRestart,
  onQueue,
  onEdit,
  onDelete,
  onNew,
}: {
  sources: SourceRow[];
  selected: Set<string>;
  shuffleOn: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onShuffle: () => void;
  onOpen: (source: SourceRow) => void;
  onRestart: (source: SourceRow) => void;
  onQueue: (mode: string, stanzas?: boolean) => void;
  onEdit: (source: SourceRow) => void;
  onDelete: (source: SourceRow) => Promise<void>;
  onNew: () => void;
}) {
  const [selecting, setSelecting] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const picked = sources.filter((source) => selected.has(source.id)).length;

  useEffect(() => {
    if (!menuFor) return;
    function onPointer(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuFor(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuFor(null);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuFor]);

  function stopSelecting() {
    setSelecting(false);
    if (picked > 0) onToggleAll();
  }

  if (sources.length === 0) {
    return (
      <section className="card empty">
        <strong>No passages yet</strong>
        <p className="muted">Write one, or import a text file you want to learn by heart.</p>
        <div className="actions">
          <button type="button" className="primary" onClick={onNew}>New passage</button>
        </div>
      </section>
    );
  }

  return (
    <section className={selecting ? "library selecting" : "library"}>
      <div className="library-bar">
        <span className="muted">{sources.length} {sources.length === 1 ? "passage" : "passages"}</span>
        {selecting ? (
          <button type="button" className="link-button" onClick={stopSelecting}>Done</button>
        ) : (
          <button type="button" className="link-button" onClick={() => setSelecting(true)}>Select</button>
        )}
      </div>
      <div className="list">
        {sources.map((source) => {
          const place = loadTypingPlace(source.id);
          const unfinished = Boolean(place && place.endedAt === null && place.pos > 0);
          const percent = unfinished && place ? Math.min(100, Math.round((place.pos / Math.max(1, source.body.length)) * 100)) : 0;
          const checked = selected.has(source.id);
          return (
            <article className={checked ? "card source picked" : "card source"} key={source.id}>
              <button
                type="button"
                className="source-open"
                aria-pressed={selecting ? checked : undefined}
                onClick={() => (selecting ? onToggle(source.id) : onOpen(source))}
              >
                {selecting && <span className={checked ? "tick on" : "tick"} aria-hidden="true" />}
                <span className="source-body">
                  <strong>{source.name}</strong>
                  <span className="source-preview">{source.body}</span>
                  <span className="source-meta">
                    <span>{words(source.body)} words</span>
                    {unfinished && <span className="pill">Resume · {percent}%</span>}
                  </span>
                  {unfinished && (
                    <span className="meter" aria-hidden="true">
                      <span style={{ width: `${percent}%` }} />
                    </span>
                  )}
                </span>
              </button>
              {!selecting && (
                <div className="source-more" ref={menuFor === source.id ? menuRef : undefined}>
                  <button
                    type="button"
                    className="icon-button ghost"
                    aria-label={`More for ${source.name}`}
                    aria-expanded={menuFor === source.id}
                    onClick={() => setMenuFor((current) => (current === source.id ? null : source.id))}
                  >
                    <MoreIcon />
                  </button>
                  {menuFor === source.id && (
                    <div className="source-menu">
                      <button type="button" onClick={() => { setMenuFor(null); onEdit(source); }}>Edit</button>
                      {unfinished && <button type="button" onClick={() => { setMenuFor(null); onRestart(source); }}>Start over</button>}
                      <button
                        type="button"
                        className="bad"
                        onClick={() => {
                          setMenuFor(null);
                          onDelete(source).catch((reason: Error) => window.alert(reason.message));
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {selecting && (
        <div className="queue-bar">
          <div className="queue-row">
            <span><strong>{picked}</strong> selected</span>
            <button type="button" className="link-button" onClick={onToggleAll}>
              {picked === sources.length ? "Clear" : "Select all"}
            </button>
            <button type="button" className="link-button" aria-pressed={shuffleOn} onClick={onShuffle}>
              {shuffleOn ? "Shuffle on" : "Shuffle off"}
            </button>
          </div>
          <div className="queue-row">
            <button type="button" className="primary" disabled={picked === 0} onClick={() => onQueue(PRACTICE)}>Practice</button>
            <button type="button" disabled={picked === 0} onClick={() => onQueue(RECALL)}>Recall</button>
            <button type="button" disabled={picked === 0} onClick={() => onQueue(RECALL, true)}>Stanzas</button>
          </div>
        </div>
      )}
    </section>
  );
}

function ImportText({ onImported }: { onImported: (file: File) => Promise<void> }) {
  const [error, setError] = useState("");
  return (
    <section className="card import-screen">
      <h2>Import a passage</h2>
      <p>
        Choose a plain text file. The file name, without the extension, becomes the source name.
        Line breaks stay in the passage. Practice shows the text as you type. Recall hides it until you type each word.
      </p>
      <p className="muted">Sample format</p>
      <pre className="snippet">{SAMPLE_PASSAGE}</pre>
      <div className="actions">
        <button type="button" onClick={downloadSample}>Download sample</button>
        <label className="file-button primary">
          Choose text file
          <input
            type="file"
            accept=".txt,.text,.md,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              onImported(file).catch((reason: Error) => setError(reason.message));
            }}
          />
        </label>
      </div>
      {error && <p className="bad">{error}</p>}
    </section>
  );
}

function Editor({ source, onSave, onCancel }: { source: SourceRow | null; onSave: (name: string, body: string) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState(source?.name ?? "");
  const [body, setBody] = useState(source?.body ?? "");
  const [error, setError] = useState("");

  return (
    <form
      className="card"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(name, body).catch((reason: Error) => setError(reason.message));
      }}
    >
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        Passage
        <textarea value={body} onChange={(event) => setBody(event.target.value)} />
      </label>
      <p className="muted">{words(body)} words</p>
      {error && <p className="bad">{error}</p>}
      <div className="actions">
        <button className="primary">Save</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function Game({
  source,
  mode,
  stanzas,
  fresh,
  place,
  total,
  nextName,
  onAdvance,
  onJump,
  onMode,
  onStanzas,
  onScores,
  onBack,
  onRestart,
}: {
  source: SourceRow;
  mode: string;
  stanzas: boolean;
  fresh: boolean;
  place: number;
  total: number;
  nextName: string;
  onAdvance: () => void;
  onJump: (index: number) => void;
  onMode: (mode: string) => void;
  onStanzas: (stanzas: boolean) => void;
  onScores: () => void;
  onBack: () => void;
  onRestart: () => void;
}) {
  const parts = stanzasOf(source.body);
  const [stanzaIndex, setStanzaIndex] = useState(() => {
    if (!stanzas || fresh) return 0;
    const saved = loadTypingPlace(source.id);
    if (!saved || typeof saved.stanza !== "number") return 0;
    return Math.min(Math.max(0, saved.stanza), Math.max(0, parts.length - 1));
  });
  const [engine, setEngine] = useState(() => {
    const text = stanzas ? (parts[stanzaIndex] || source.body) : source.body;
    const next = new Engine(text, mode);
    if (!fresh) {
      const saved = loadTypingPlace(source.id);
      const sameScope = stanzas ? saved?.stanza === stanzaIndex : saved?.stanza == null;
      if (saved && saved.mode === mode && saved.endedAt === null && sameScope) next.restore(saved);
    }
    return next;
  });
  const [activeStanzas, setActiveStanzas] = useState(stanzas);
  const [tracked, setTracked] = useState({ id: source.id, mode, stanzas });
  if (source.id !== tracked.id) {
    setTracked({ id: source.id, mode, stanzas });
    setActiveStanzas(stanzas);
    setStanzaIndex(0);
    setEngine(new Engine(stanzas ? (parts[0] || source.body) : source.body, mode));
  } else if (mode !== tracked.mode || stanzas !== tracked.stanzas) {
    const untouched = engine.startedAt === null && !engine.finished;
    setTracked({ id: source.id, mode, stanzas });
    if (untouched) {
      const index = stanzas ? 0 : stanzaIndex;
      if (stanzas) setStanzaIndex(0);
      setActiveStanzas(stanzas);
      setEngine(new Engine(stanzas ? (parts[index] || source.body) : source.body, mode));
    }
  }
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const promptRef = useRef<HTMLElement>(null);
  const phoneMenuRef = useRef<HTMLDivElement>(null);
  const [phoneMenu, setPhoneMenu] = useState(false);
  const chrome = useAppChrome();
  const lineSettled = useRef(false);
  const flashTimer = useRef(0);
  const settingsRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const lined = useRef(false);
  const recorded = useRef<Engine | null>(null);
  const [tick, setTick] = useState(0);
  const [alert, setAlert] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pagerOpen, setPagerOpen] = useState(false);
  const [jump, setJump] = useState(String(place));
  const [rank, setRank] = useState<{ engine: Engine; value: number | null } | null>(null);
  const [now, setNow] = useState(() => Date.now() / 1000);
  const shownRank = rank?.engine === engine ? rank.value : undefined;

  useEffect(() => {
    inputRef.current?.focus();
    lineSettled.current = false;
  }, [engine]);

  useEffect(() => {
    const box = promptRef.current;
    if (!box) return;
    function place(smooth: boolean) {
      const passage = box?.querySelector(".passage");
      if (passage instanceof HTMLElement && box) {
        const half = box.clientHeight / 2;
        passage.style.paddingTop = `${half}px`;
        passage.style.paddingBottom = `${half}px`;
      }
      if (!box || engine.finished) return;
      const marker = box.querySelector(".target, .caret");
      if (!(marker instanceof HTMLElement)) return;
      const top = marker.offsetTop + marker.offsetHeight / 2 - box.clientHeight / 2;
      box.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
    }
    place(lineSettled.current);
    lineSettled.current = true;
    const observer = new ResizeObserver(() => place(false));
    observer.observe(box);
    return () => observer.disconnect();
  }, [engine, tick, engine.finished]);

  useEffect(() => {
    setJump(String(activeStanzas ? stanzaIndex + 1 : place));
  }, [place, activeStanzas, stanzaIndex]);

  useEffect(() => {
    if (engine.finished) {
      clearTypingPlace(source.id);
      inputRef.current?.blur();
      return;
    }
    if (engine.startedAt === null && engine.pos === 0 && !activeStanzas) return;
    saveTypingPlace({
      sourceId: source.id,
      mode: engine.mode,
      stanza: activeStanzas ? stanzaIndex : undefined,
      ...engine.snapshot(),
    });
  }, [engine, source.id, tick, activeStanzas, stanzaIndex]);

  useEffect(() => {
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (settingsOpen && settingsRef.current && !settingsRef.current.contains(target)) setSettingsOpen(false);
      if (phoneMenu && phoneMenuRef.current && !phoneMenuRef.current.contains(target)) setPhoneMenu(false);
      if (pagerOpen && sheetRef.current && !sheetRef.current.contains(target)) setPagerOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setSettingsOpen(false);
      setPhoneMenu(false);
      setPagerOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [settingsOpen, pagerOpen, phoneMenu]);

  useEffect(() => {
    if (engine.mode !== RECALL || engine.finished) return;
    function onKey(event: KeyboardEvent) {
      if (event.repeat || event.altKey || event.shiftKey) return;
      if (!(event.ctrlKey || event.metaKey) || event.key !== "Enter") return;
      event.preventDefault();
      if (!engine.reveal(Date.now() / 1000)) return;
      setSettingsOpen(false);
      setPhoneMenu(false);
      bump(false);
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [engine, engine.mode, engine.finished]);

  useEffect(() => {
    if (!engine.finished) return;
    function onKey(event: KeyboardEvent) {
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      const field = event.target instanceof HTMLElement && event.target.closest("button, a, input, textarea");
      if (field) return;
      if (event.key === " ") {
        event.preventDefault();
        if (activeStanzas) restartStanza();
        else onAdvance();
      } else if (event.key === "Enter" && activeStanzas) {
        event.preventDefault();
        nextStanza();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [engine.finished, onAdvance, activeStanzas, stanzaIndex, parts.length, engine.mode, source.body]);

  useEffect(() => {
    if (!engine.startedAt || engine.finished) return;
    const id = window.setInterval(() => setNow(Date.now() / 1000), 200);
    return () => window.clearInterval(id);
  }, [engine, tick, engine.finished]);

  useEffect(() => {
    if (!engine.finished || recorded.current === engine) return;
    recorded.current = engine;
    const seconds = engine.elapsed(Date.now() / 1000);
    recordScore({
      source_id: source.id,
      mode: scoreMode(engine.mode, activeStanzas),
      score: engine.score,
      wpm: engine.wpm(Date.now() / 1000),
      accuracy: engine.accuracy(),
      seconds,
    })
      .then((value) => setRank({ engine, value }))
      .catch(() => setRank({ engine, value: null }));
  }, [engine, engine.finished, source.id, tick, activeStanzas]);

  function bump(mistake: boolean) {
    setTick((value) => value + 1);
    setNow(Date.now() / 1000);
    if (!mistake) return;
    window.clearTimeout(flashTimer.current);
    setAlert(false);
    window.requestAnimationFrame(() => {
      setAlert(true);
      flashTimer.current = window.setTimeout(() => setAlert(false), 700);
    });
  }

  function take(text: string) {
    const moment = Date.now() / 1000;
    let mistake = false;
    for (const ch of text) {
      const outcome = engine.handleChar(ch, moment);
      if (outcome === "mistake") mistake = true;
    }
    bump(mistake);
  }

  function openStanza(index: number, typingMode = engine.mode) {
    const text = parts[index] || source.body;
    setStanzaIndex(index);
    setActiveStanzas(true);
    setAlert(false);
    setEngine(new Engine(text, typingMode));
  }

  function restartStanza() {
    clearTypingPlace(source.id);
    const text = activeStanzas ? (parts[stanzaIndex] || source.body) : source.body;
    setAlert(false);
    setEngine(new Engine(text, engine.mode));
  }

  function nextStanza() {
    if (stanzaIndex + 1 < parts.length) {
      openStanza(stanzaIndex + 1);
      return;
    }
    if (total > 1) onAdvance();
    else openStanza(0);
  }

  const elapsed = engine.elapsed(now);
  const wpm = elapsed >= 1 ? Math.round(engine.wpm(now)) : null;
  const accuracy = engine.accuracy();
  const summary = [
    `${engine.score} points`,
    wpm === null ? "" : `${wpm} WPM`,
    accuracy === null ? "" : `${Math.round(accuracy)}%`,
    shownRank === undefined ? "Saving…" : shownRank ? `Rank ${shownRank}` : "Saved",
  ].filter(Boolean).join(" · ");

  function revealWord() {
    if (engine.mode !== RECALL || engine.finished) return;
    if (!engine.reveal(Date.now() / 1000)) return;
    setSettingsOpen(false);
    setPhoneMenu(false);
    bump(false);
    inputRef.current?.focus();
  }

  function goToSource() {
    const index = Number(jump) - 1;
    if (activeStanzas) {
      if (!Number.isInteger(index) || index < 0 || index >= parts.length || index === stanzaIndex) return;
      setPagerOpen(false);
      openStanza(index);
      return;
    }
    if (!Number.isInteger(index) || index < 0 || index >= total || index === place - 1) return;
    setPagerOpen(false);
    onJump(index);
  }

  const where = activeStanzas ? `Stanza ${stanzaIndex + 1} of ${parts.length}` : `${place} of ${total}`;

  return (
    <>
    <div className="play-bar" ref={phoneMenuRef}>
      <button
        type="button"
        className="crumb-back play-back"
        aria-label="Back"
        onClick={onBack}
        onPointerUp={(event) => {
          if (event.pointerType !== "touch" || event.button !== 0) return;
          event.preventDefault();
          onBack();
        }}
      >
        <span aria-hidden="true">←</span>
      </button>
      <span className="crumb-current">{source.name}</span>
      <span className="play-stat">{clock(elapsed)}</span>
      <span className="play-stat">{engine.score} pts</span>
      <button
        type="button"
        className="icon-button"
        aria-expanded={phoneMenu}
        aria-controls="phone-game-menu"
        aria-label={phoneMenu ? "Close menu" : "Open menu"}
        onClick={() => setPhoneMenu((open) => !open)}
      >
        <span className="bars" />
      </button>
      {phoneMenu && (
        <nav id="phone-game-menu" className="menu">
          <p className="muted">{engine.mode === PRACTICE ? "Practice" : "Recall"}{activeStanzas ? " · Stanzas" : ""} · {where}</p>
          <p className="muted">{wpm === null ? "— WPM" : `${wpm} WPM`} · {accuracy === null ? "—" : `${Math.round(accuracy)}%`}</p>
          <button type="button" onClick={() => { setPhoneMenu(false); onScores(); }}>High scores</button>
          <div className="mode-row">
            <button type="button" aria-pressed={mode === PRACTICE} onClick={() => onMode(PRACTICE)}>Practice</button>
            <button type="button" aria-pressed={mode === RECALL} onClick={() => onMode(RECALL)}>Recall</button>
          </div>
          <div className="mode-row">
            <button type="button" aria-pressed={!stanzas} onClick={() => onStanzas(false)}>Whole passage</button>
            <button type="button" aria-pressed={stanzas} onClick={() => onStanzas(true)}>Stanzas</button>
          </div>
          {parts.length === 1 && stanzas && <p className="muted">No blank line in this passage, so it is one stanza.</p>}
          {(mode !== engine.mode || stanzas !== activeStanzas) && (
            <p className="muted">Restart to switch this run.</p>
          )}
          <button
            type="button"
            onClick={() => {
              setPhoneMenu(false);
              if (stanzas !== activeStanzas || mode !== engine.mode) onRestart();
              else if (activeStanzas) restartStanza();
              else onRestart();
            }}
          >
            Restart
          </button>
          <button type="button" aria-pressed={chrome.tool === "typing"} onClick={() => chrome.choose("typing")}>Typing</button>
          <button type="button" aria-pressed={chrome.tool === "flash"} onClick={() => chrome.choose("flash")}>Flashcards</button>
          <div className="menu-account">
            {chrome.signOut ? <button type="button" onClick={chrome.signOut}>Sign out · {chrome.accountLabel}</button> : <span className="muted">Saved in this browser</span>}
          </div>
        </nav>
      )}
    </div>
    <section className="stage">
      <div className="stats quiz-bar" ref={settingsRef}>
        <span>{engine.mode === PRACTICE ? "Practice" : "Recall"}{activeStanzas ? " · Stanzas" : ""}</span>
        <span>{where}</span>
        <span>{clock(elapsed)}</span>
        <span>{engine.score} pts</span>
        <span>{wpm === null ? "—" : `${wpm} WPM`}</span>
        <span>{accuracy === null ? "—" : `${Math.round(accuracy)}%`}</span>
        <div className="icon-pair">
          <button type="button" className="icon-button" aria-label="High scores" onClick={onScores}>
            <PodiumIcon />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-expanded={settingsOpen}
            aria-label={settingsOpen ? "Close game settings" : "Game settings"}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <OptionsIcon />
          </button>
        </div>
        {settingsOpen && (
          <div className="quiz-menu">
            <div className="mode-row">
              <button type="button" aria-pressed={mode === PRACTICE} onClick={() => onMode(PRACTICE)}>Practice</button>
              <button type="button" aria-pressed={mode === RECALL} onClick={() => onMode(RECALL)}>Recall</button>
            </div>
            <div className="mode-row">
              <button type="button" aria-pressed={!stanzas} onClick={() => onStanzas(false)}>Whole passage</button>
              <button type="button" aria-pressed={stanzas} onClick={() => onStanzas(true)}>Stanzas</button>
            </div>
            {parts.length === 1 && stanzas && <p className="muted">No blank line in this passage, so it is one stanza.</p>}
            {(mode !== engine.mode || stanzas !== activeStanzas) && (
              <p className="muted">
                {total === 1
                  ? "Restart to switch this run."
                  : "The next source uses this setting. This one stays as it is."}
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setSettingsOpen(false);
                if (stanzas !== activeStanzas || mode !== engine.mode) onRestart();
                else if (activeStanzas) restartStanza();
                else onRestart();
              }}
            >
              Restart
            </button>
          </div>
        )}
      </div>
      <article ref={promptRef} className={alert && !engine.finished ? "card prompt mistake passage-frame" : "card prompt passage-frame"}>
        <span className="sr-only" aria-live="polite">{alert && !engine.finished ? "Incorrect" : ""}</span>
        <Passage engine={engine} alert={alert} />
      </article>
      <div className="card answer">
        <div className="type-row">
        <label className="type-field">
          <span className="type-label">Type here</span>
          <textarea
            ref={inputRef}
            className="type-line"
            rows={1}
            enterKeyHint="enter"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            readOnly={engine.finished}
            onChange={(event) => {
              let value = event.target.value;
              event.target.value = "";
              if (lined.current) {
                lined.current = false;
                value = value.replace(/\r?\n/g, "");
              }
              if (value) take(value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Backspace") {
                event.preventDefault();
                engine.backspace();
                bump(false);
                return;
              }
              if (event.key === "Enter" && !event.ctrlKey && !event.altKey && !event.metaKey) {
                event.preventDefault();
                lined.current = true;
                take("\n");
              }
            }}
          />
        </label>
        {engine.mode === RECALL && !engine.finished && (
          <button type="button" className="icon-button reveal-button" aria-label="Reveal word" onClick={revealWord}>
            <RevealIcon />
          </button>
        )}
        </div>
        {engine.finished && activeStanzas && (
          <>
            <p className="good">
              Finished stanza {stanzaIndex + 1}. {summary}. Space runs it again. Enter for {stanzaIndex + 1 < parts.length ? `stanza ${stanzaIndex + 2}` : total > 1 ? nextName : "stanza 1"}.
            </p>
            <div className="actions">
              <button type="button" onClick={restartStanza}>Again</button>
              <button type="button" className="primary" onClick={nextStanza}>{stanzaIndex + 1 < parts.length ? "Next stanza" : total > 1 ? "Next passage" : "First stanza"}</button>
            </div>
          </>
        )}
        {engine.finished && !activeStanzas && (
          <>
            <p className="good">Finished. {summary}. {total === 1 ? "Space to start again." : `Space for ${nextName}.`}</p>
            <div className="actions">
              <button type="button" className="primary" onClick={onAdvance}>Next</button>
            </div>
          </>
        )}
      </div>
      {pagerOpen && <button type="button" className="sheet-backdrop" aria-label={activeStanzas ? "Close stanza jump" : "Close source jump"} onClick={() => setPagerOpen(false)} />}
      <div className="sheet-dock" ref={sheetRef}>
        {pagerOpen && (
          <div className="quiz-sheet pager-sheet" id="source-jump">
            <div className="pager">
              <button
                type="button"
                className="icon-button"
                aria-label={activeStanzas ? "Previous stanza" : "Previous source"}
                disabled={(activeStanzas ? stanzaIndex : place - 1) <= 0}
                onClick={() => (activeStanzas ? openStanza(stanzaIndex - 1) : onJump(place - 2))}
              >
                <ArrowIcon direction="left" />
              </button>
              <div className="pager-center">
                <label>
                  {activeStanzas ? "Go to stanza" : "Go to source"}
                  <input
                    type="number"
                    min={1}
                    max={activeStanzas ? parts.length : total}
                    inputMode="numeric"
                    value={jump}
                    onChange={(event) => setJump(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        goToSource();
                      }
                    }}
                  />
                </label>
                <button type="button" onClick={goToSource}>Go</button>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label={activeStanzas ? "Next stanza" : "Next source"}
                disabled={activeStanzas ? stanzaIndex >= parts.length - 1 : place >= total}
                onClick={() => (activeStanzas ? openStanza(stanzaIndex + 1) : onJump(place))}
              >
                <ArrowIcon direction="right" />
              </button>
            </div>
          </div>
        )}
        <button
          type="button"
          className="sheet-handle"
          aria-expanded={pagerOpen}
          aria-controls="source-jump"
          aria-label={pagerOpen ? (activeStanzas ? "Close stanza jump" : "Close source jump") : (activeStanzas ? "Go to stanza" : "Go to source")}
          onClick={() => setPagerOpen((open) => !open)}
        >
          <span className={pagerOpen ? "sheet-chevron down" : "sheet-chevron"} />
        </button>
      </div>
    </section>
    </>
  );
}

function RevealIcon() {
  return (
    <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function Passage({ engine, alert }: { engine: Engine; alert: boolean }) {
  if (engine.mode === RECALL) {
    const shown = engine.visibleText();
    return (
      <div className="prompt-body">
        <p className="passage">
          {shown}
          {!engine.finished && <span className={alert ? "caret bad" : "caret"} />}
          {engine.revealed && !engine.finished && (
            <span className="revealed-word">{engine.currentWord.slice(engine.typed.length)}</span>
          )}
        </p>
      </div>
    );
  }
  const pos = engine.finished ? engine.text.length : engine.pos;
  const next = engine.text[pos] ?? "";
  const marked = next === " " ? "\u00a0" : next;
  return (
    <p className="passage">
      <span>{engine.text.slice(0, pos)}</span>
      {!engine.finished && next && (
        <span className={alert ? "target bad" : next === "\n" ? "target target-break" : "target"}>{marked}</span>
      )}
      <span className="pending">{engine.text.slice(pos + (engine.finished || !next ? 0 : 1))}</span>
    </p>
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

function PlusIcon() {
  return (
    <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg className="glyph" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5.5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="18.5" cy="12" r="1.2" />
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

function scoreName(mode: string): string {
  if (mode === PRACTICE) return "Practice";
  if (mode === RECALL) return "Recall";
  if (mode === "stanza-practice") return "Stanza practice";
  if (mode === "stanza-recall") return "Stanza recall";
  return mode;
}

function Scores({ sources }: { sources: SourceRow[] }) {
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [mode, setMode] = useState("all");
  const [rows, setRows] = useState<ScoreRow[]>([]);

  useEffect(() => {
    if (!sourceId && sources[0]) setSourceId(sources[0].id);
  }, [sourceId, sources]);

  useEffect(() => {
    if (!sourceId) return;
    listScores(sourceId).then(setRows).catch(() => setRows([]));
  }, [sourceId]);

  const shown = rows.filter((row) => mode === "all" || row.mode === mode);

  return (
    <section className="card">
      <label>
        Source
        <select value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
          {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
        </select>
      </label>
      <div className="switch">
        {[["all", "All"], [PRACTICE, "Practice"], [RECALL, "Recall"], ["stanza-practice", "Stanza practice"], ["stanza-recall", "Stanza recall"]].map(([value, label]) => (
          <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>
            {label}
          </button>
        ))}
      </div>
      <p className="muted">1 point per correct character. Spaces do not score. Revealed recall characters score 0.</p>
      {shown.length === 0 && <p className="muted">No scores yet.</p>}
      {shown.map((row, index) => (
        <div className="score-line" key={row.id}>
          <span>{index + 1}</span>
          <span>{scoreName(row.mode)} · {Math.round(row.wpm)} WPM · {row.accuracy === null ? "—" : `${Math.round(row.accuracy)}%`}</span>
          <strong>{row.score}</strong>
        </div>
      ))}
    </section>
  );
}
