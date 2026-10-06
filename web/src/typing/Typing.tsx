import { useEffect, useRef, useState } from "react";
import { deleteSource, ensureSample, listScores, listSources, recordScore, saveSource, type ScoreRow, type SourceRow } from "../lib/db";
import { Engine, PRACTICE, RECALL } from "../lib/engine";

type Page = "library" | "edit" | "game" | "scores";

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

export function Typing() {
  const [page, setPage] = useState<Page>("library");
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<SourceRow | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shuffleOn, setShuffleOn] = useState(false);
  const [run, setRun] = useState(0);
  const [playing, setPlaying] = useState<{ sources: SourceRow[]; index: number; mode: string } | null>(null);

  function start(mode: string, list: SourceRow[], shuffle: boolean) {
    if (list.length === 0) return;
    setRun((value) => value + 1);
    setPlaying({ sources: shuffle ? shuffleSources(list) : list, index: 0, mode });
    setPage("game");
  }

  async function refresh() {
    await ensureSample();
    setSources(await listSources());
  }

  useEffect(() => {
    refresh().catch((reason: Error) => setError(reason.message));
  }, []);

  return (
    <>
      <nav className="subnav">
        <button aria-pressed={page === "library"} onClick={() => setPage("library")}>Library</button>
        <button aria-pressed={page === "edit"} onClick={() => { setEditing(null); setPage("edit"); }}>New source</button>
        <button aria-pressed={page === "scores"} onClick={() => setPage("scores")}>High scores</button>
      </nav>
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
          onPlay={(source, mode) => start(mode, [source], false)}
          onQueue={(mode) => start(mode, sources.filter((source) => selected.has(source.id)), shuffleOn)}
          onEdit={(source) => { setEditing(source); setPage("edit"); }}
          onDelete={async (source) => {
            if (!window.confirm(`Delete ${source.name}?`)) return;
            await deleteSource(source.id);
            await refresh();
          }}
          onImport={async (file) => {
            const text = await file.text();
            await saveSource({ name: file.name.replace(/\.[^.]+$/, ""), body: text });
            await refresh();
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
          key={run}
          source={playing.sources[playing.index]}
          mode={playing.mode}
          place={playing.index + 1}
          total={playing.sources.length}
          nextName={playing.sources[(playing.index + 1) % playing.sources.length].name}
          onAdvance={() => {
            setRun((value) => value + 1);
            setPlaying((current) => current ? { ...current, index: (current.index + 1) % current.sources.length } : current);
          }}
          onMode={(mode) => setPlaying((current) => current ? { ...current, mode } : current)}
          onLeave={() => setPage("library")}
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
  onPlay,
  onQueue,
  onEdit,
  onDelete,
  onImport,
}: {
  sources: SourceRow[];
  selected: Set<string>;
  shuffleOn: boolean;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onShuffle: () => void;
  onPlay: (source: SourceRow, mode: string) => void;
  onQueue: (mode: string) => void;
  onEdit: (source: SourceRow) => void;
  onDelete: (source: SourceRow) => Promise<void>;
  onImport: (file: File) => Promise<void>;
}) {
  const picked = sources.filter((source) => selected.has(source.id)).length;
  return (
    <section className="list">
      <label>
        Import a text file
        <input
          type="file"
          accept=".txt,.text,.md,text/plain"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onImport(file).catch((reason: Error) => window.alert(reason.message));
          }}
        />
      </label>
      <div className="card">
        <div className="actions">
          <button type="button" onClick={onToggleAll} disabled={sources.length === 0}>
            {picked === sources.length && sources.length > 0 ? "Clear" : "Select all"}
          </button>
          <button type="button" aria-pressed={shuffleOn} onClick={onShuffle}>{shuffleOn ? "Shuffle on" : "Shuffle off"}</button>
        </div>
        <div className="actions">
          <button type="button" className="primary" disabled={picked === 0} onClick={() => onQueue(PRACTICE)}>Practice selected</button>
          <button type="button" disabled={picked === 0} onClick={() => onQueue(RECALL)}>Recall selected</button>
        </div>
        <p className="muted">{picked} selected. After each source, Space starts the next. The queue repeats until you return to the library.</p>
      </div>
      {sources.map((source) => (
        <article className="card item" key={source.id}>
          <label className="pick">
            <input type="checkbox" checked={selected.has(source.id)} onChange={() => onToggle(source.id)} />
            <span>{source.name}</span>
          </label>
          <span className="muted">{words(source.body)} words</span>
          <div className="actions">
            <button className="primary" onClick={() => onPlay(source, PRACTICE)}>Practice</button>
            <button onClick={() => onPlay(source, RECALL)}>Recall</button>
            <button onClick={() => onEdit(source)}>Edit</button>
            <button className="bad" onClick={() => onDelete(source).catch((reason: Error) => window.alert(reason.message))}>Delete</button>
          </div>
        </article>
      ))}
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
  place,
  total,
  nextName,
  onAdvance,
  onMode,
  onLeave,
}: {
  source: SourceRow;
  mode: string;
  place: number;
  total: number;
  nextName: string;
  onAdvance: () => void;
  onMode: (mode: string) => void;
  onLeave: () => void;
}) {
  const [engine, setEngine] = useState(() => new Engine(source.body, mode));
  const [tracked, setTracked] = useState({ id: source.id, mode });
  if (source.id !== tracked.id) {
    setTracked({ id: source.id, mode });
    setEngine(new Engine(source.body, mode));
  } else if (mode !== tracked.mode) {
    const untouched = engine.startedAt === null && !engine.finished;
    setTracked({ id: source.id, mode });
    if (untouched) setEngine(new Engine(source.body, mode));
  }
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lined = useRef(false);
  const recorded = useRef<Engine | null>(null);
  const [tick, setTick] = useState(0);
  const [alert, setAlert] = useState(false);
  const [rank, setRank] = useState<{ engine: Engine; value: number | null } | null>(null);
  const [now, setNow] = useState(() => Date.now() / 1000);
  const shownRank = rank?.engine === engine ? rank.value : undefined;

  useEffect(() => {
    inputRef.current?.focus();
  }, [engine]);

  useEffect(() => {
    if (!engine.finished) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== " " || event.repeat) return;
      event.preventDefault();
      onAdvance();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [engine.finished, onAdvance]);

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
      mode: engine.mode,
      score: engine.score,
      wpm: engine.wpm(Date.now() / 1000),
      accuracy: engine.accuracy(),
      seconds,
    })
      .then((value) => setRank({ engine, value }))
      .catch(() => setRank({ engine, value: null }));
  }, [engine, engine.finished, source.id, tick]);

  function bump(mistake: boolean) {
    setTick((value) => value + 1);
    setNow(Date.now() / 1000);
    if (mistake) {
      setAlert(true);
      window.setTimeout(() => setAlert(false), 180);
    }
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

  const elapsed = engine.elapsed(now);
  const wpm = elapsed >= 1 ? Math.round(engine.wpm(now)) : null;
  const accuracy = engine.accuracy();

  return (
    <section className="stage">
      <div className="stats">
        <span>{engine.mode === PRACTICE ? "Practice" : "Recall"}</span>
        <span>{place} of {total}</span>
        <span>{clock(elapsed)}</span>
        <span>{engine.score} pts</span>
        <span>{wpm === null ? "—" : `${wpm} WPM`}</span>
        <span>{accuracy === null ? "—" : `${Math.round(accuracy)}%`}</span>
      </div>
      <article className="card prompt">
        <Passage engine={engine} alert={alert} />
      </article>
      <div className="card answer">
        <label>
          Type here
            <textarea
            ref={inputRef}
            className="type-line"
            rows={1}
            enterKeyHint="enter"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            disabled={engine.finished}
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
        <div className="switch">
          <button type="button" aria-pressed={mode === PRACTICE} onClick={() => onMode(PRACTICE)}>Practice</button>
          <button type="button" aria-pressed={mode === RECALL} onClick={() => onMode(RECALL)}>Recall</button>
        </div>
        {mode !== engine.mode && (
          <p className="muted">Next source: {mode === PRACTICE ? "Practice" : "Recall"}. This one stays {engine.mode === PRACTICE ? "Practice" : "Recall"}.</p>
        )}
        <div className="actions">
          {engine.mode === RECALL && !engine.finished && (
            <button
              type="button"
              onClick={() => {
                engine.reveal(Date.now() / 1000);
                bump(false);
                inputRef.current?.focus();
              }}
            >
              Reveal word
            </button>
          )}
          {!engine.finished && <button type="button" onClick={onLeave}>Library</button>}
        </div>
        {engine.finished && (
          <div className="banner ok">
            <p className="good">Finished {source.name}.</p>
            <p>
              {engine.score} points
              {wpm === null ? "" : ` · ${wpm} WPM`}
              {accuracy === null ? "" : ` · ${Math.round(accuracy)}%`}
              {shownRank === undefined ? " · Saving…" : shownRank ? ` · Rank ${shownRank}` : " · Saved"}
            </p>
            <p className="muted">{total === 1 ? "Space to start again." : `Space for ${nextName}.`}</p>
            <div className="actions">
              <button type="button" className="primary" onClick={onAdvance}>Next</button>
              <button type="button" onClick={onLeave}>Library</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Passage({ engine, alert }: { engine: Engine; alert: boolean }) {
  if (engine.mode === RECALL) {
    const shown = engine.visibleText();
    return (
      <div className="prompt-body">
        {engine.revealed && <p className="muted">Revealed: {engine.currentWord}</p>}
        {alert && <p className="bad">Incorrect</p>}
        <p className="passage">
          {shown}
          {!engine.finished && <span className={alert ? "caret bad" : "caret"} />}
          {!shown && !engine.finished && (
            <span className="faint">{engine.revealed ? "   Type the revealed word." : "   Type the first word from memory."}</span>
          )}
        </p>
      </div>
    );
  }
  const pos = engine.finished ? engine.text.length : engine.pos;
  return (
    <p className="passage">
      <span>{engine.text.slice(0, pos)}</span>
      {!engine.finished && <span className={alert ? "caret bad" : "caret"} />}
      {!engine.finished && alert && <span className="bad">{engine.text[pos]}</span>}
      <span className="pending">{engine.text.slice(alert && !engine.finished ? pos + 1 : pos)}</span>
    </p>
  );
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
        {["all", PRACTICE, RECALL].map((value) => (
          <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>
            {value === "all" ? "All" : value === PRACTICE ? "Practice" : "Recall"}
          </button>
        ))}
      </div>
      <p className="muted">1 point per correct character. Spaces do not score. Revealed recall characters score 0.</p>
      {shown.length === 0 && <p className="muted">No scores yet.</p>}
      {shown.map((row, index) => (
        <div className="score-line" key={row.id}>
          <span>{index + 1}</span>
          <span>{row.mode} · {Math.round(row.wpm)} WPM · {row.accuracy === null ? "—" : `${Math.round(row.accuracy)}%`}</span>
          <strong>{row.score}</strong>
        </div>
      ))}
    </section>
  );
}
