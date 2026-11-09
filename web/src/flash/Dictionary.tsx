import { useEffect, useState } from "react";
import {
  BANDS,
  THE_ZIPF,
  type Lexeme,
  deckName,
  drawLexemes,
  formatOccurrences,
  formatShare,
  frequencyExtent,
  inBand,
  lexemeCard,
  loadLexicon,
  nearestLexeme,
  perMillionFromZipf,
  perMillionToSlider,
  sliderToPerMillion,
} from "../lib/dictionary";
import { importDeck, sanitizeName, type DeckRow } from "../lib/db";
import { DEFAULT_PRACTICE } from "../lib/flash";
import { saveDeckPractice } from "../lib/prefs";

const DEFAULT_BAND = BANDS.find((band) => band.id === "uncommon") ?? BANDS[0];

export function DictionaryDeck({
  decks,
  onCreated,
}: {
  decks: DeckRow[];
  onCreated: (id: string) => Promise<void>;
}) {
  const [lexicon, setLexicon] = useState<Lexeme[] | null>(null);
  const [error, setError] = useState("");
  const [floor, setFloor] = useState<number>(DEFAULT_BAND.floor);
  const [ceiling, setCeiling] = useState<number>(DEFAULT_BAND.ceiling);
  const [count, setCount] = useState(40);
  const [name, setName] = useState(deckName(DEFAULT_BAND.floor, DEFAULT_BAND.ceiling));
  const [nameEdited, setNameEdited] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadLexicon().then(setLexicon).catch((reason: Error) => setError(reason.message));
  }, []);

  const autoName = deckName(floor, ceiling);
  useEffect(() => {
    if (!nameEdited) setName(autoName);
  }, [autoName, nameEdited]);

  const extent = lexicon ? frequencyExtent(lexicon) : { min: 0.1, max: 2000 };
  const pool = lexicon ? inBand(lexicon, floor, ceiling) : [];
  const draw = Math.min(pool.length, count);
  const typical = lexicon ? nearestLexeme(pool.length ? pool : lexicon, Math.sqrt(floor * ceiling)) : null;
  const time = lexicon?.find((item) => item.word === "time");
  const mammoth = lexicon?.find((item) => item.word === "mammoth");

  function moveCeiling(next: number) {
    setCeiling(next);
    if (next < floor) setFloor(next);
  }

  function moveFloor(next: number) {
    setFloor(next);
    if (next > ceiling) setCeiling(next);
  }

  async function create() {
    if (!lexicon || draw < 1) return;
    const clean = sanitizeName(name);
    const match = decks.find((row) => !row.builtin_key && row.name.toLowerCase() === clean.toLowerCase());
    if (match && !window.confirm(`Replace the cards in ${match.name}?`)) return;
    setBusy(true);
    setError("");
    try {
      const cards = drawLexemes(pool, count).map(lexemeCard);
      const result = await importDeck(clean || autoName, cards);
      saveDeckPractice(result.id, { ...DEFAULT_PRACTICE, startWithTerm: false });
      await onCreated(result.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create that deck.");
      setBusy(false);
    }
  }

  return (
    <section className="card import-screen">
      <h2>From the dictionary</h2>
      <p>
        In English, “the” is about {formatShare(perMillionFromZipf(THE_ZIPF))} of all words,{" "}
        {formatOccurrences(perMillionFromZipf(THE_ZIPF))}. It is too basic to be a dictionary headword.
        {mammoth && time && (
          <>
            {" "}“{time.word}” is about {formatShare(time.perMillion)}. “{mammoth.word}” is about {formatShare(mammoth.perMillion)},{" "}
            {formatOccurrences(mammoth.perMillion)}.
          </>
        )}
        {" "}Choose how common the words can be. A deck is a random draw from that slice. You see a short definition and type the word.
      </p>
      {!lexicon && !error && <p className="muted">Loading the dictionary…</p>}
      {lexicon && (
        <>
          <div className="band-row" role="group" aria-label="Frequency presets">
            {BANDS.map((band) => {
              const selected = Math.abs(Math.log10(floor) - Math.log10(band.floor)) < 0.08
                && Math.abs(Math.log10(ceiling) - Math.log10(band.ceiling)) < 0.08;
              return (
                <button
                  key={band.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setFloor(band.floor);
                    setCeiling(band.ceiling);
                  }}
                >
                  {band.label}
                </button>
              );
            })}
          </div>
          <FrequencySlider
            label="No more common than"
            value={ceiling}
            extent={extent}
            onChange={moveCeiling}
          />
          <FrequencySlider
            label="And no rarer than"
            value={floor}
            extent={extent}
            onChange={moveFloor}
          />
          <p className="muted">
            {pool.length.toLocaleString("en-US")} words fall in this range.
            {draw > 0 && ` This deck draws ${draw.toLocaleString("en-US")} of them at random.`}
            {typical && ` A word in this range: “${typical.word}” (${formatShare(typical.perMillion)}).`}
            {time && time.perMillion > ceiling && ` “${time.word}” is more common, so it stays out.`}
          </p>
          <label>
            Cards
            <input
              type="number"
              min={1}
              max={200}
              value={count}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (!Number.isFinite(next)) return;
                setCount(Math.min(200, Math.max(1, Math.floor(next))));
              }}
            />
          </label>
          <label>
            Deck name
            <input
              value={name}
              onChange={(event) => {
                setNameEdited(true);
                setName(event.target.value);
              }}
            />
          </label>
          <div className="actions">
            <button type="button" className="primary" disabled={busy || draw < 1} onClick={() => create().catch((reason: Error) => setError(reason.message))}>
              {busy ? "Creating…" : `Create deck of ${draw}`}
            </button>
          </div>
        </>
      )}
      {error && <p className="bad">{error}</p>}
      <p className="dict-note muted">
        Definitions from WordNet. Frequencies from wordfreq.{" "}
        <a href="/lexicon-notice.txt" target="_blank" rel="noreferrer">Sources and licenses</a>
      </p>
    </section>
  );
}

function FrequencySlider({
  label,
  value,
  extent,
  onChange,
}: {
  label: string;
  value: number;
  extent: { min: number; max: number };
  onChange: (perMillion: number) => void;
}) {
  return (
    <label className="freq-field">
      {label}
      <span className="freq-readout">{formatShare(value)}</span>
      <input
        type="range"
        min={0}
        max={1000}
        value={perMillionToSlider(value, extent.min, extent.max)}
        aria-valuetext={`${formatShare(value)}, ${formatOccurrences(value)}`}
        onChange={(event) => onChange(sliderToPerMillion(Number(event.target.value), extent.min, extent.max))}
      />
      <span className="muted">{formatOccurrences(value)}</span>
    </label>
  );
}
