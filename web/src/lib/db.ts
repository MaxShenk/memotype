import { normalizePassage } from "./engine";
import { type Card, cardKey, parseDeck } from "./flash";
import {
  localDeleteDeck,
  localDeleteSource,
  localEnsureSample,
  localImportDeck,
  localListDecks,
  localListScores,
  localListSources,
  localLoadCards,
  localLoadStats,
  localRecordScore,
  localReplaceCards,
  localResetStats,
  localSaveDeck,
  localSaveSource,
  localSaveStat,
} from "./local";
import { BUILTIN_DECK_ID, type DeckRow, type ScoreRow, type SourceRow, sanitizeName } from "./model";
import { supabase } from "./supabase";

export { BUILTIN_DECK_ID, sanitizeName };
export type { DeckRow, ScoreRow, SourceRow };

const SAMPLE_NAME = "Getting Started";
const SAMPLE_TEXT = `Memory grows when you reach for a line before you look at it.

Read the passage once, then type the words you still hold. Each correct word is a light left on. If a word is gone, reveal it, then type it anyway. The fingers learn what the mind is still borrowing.`;

function db() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function listSources(): Promise<SourceRow[]> {
  if (!supabase) return localListSources();
  const { data, error } = await db().from("sources").select("id,name,body,updated_at").order("name");
  if (error) throw error;
  return data ?? [];
}

let sampleOnce: Promise<void> | null = null;

export function ensureSample(): Promise<void> {
  sampleOnce ??= ensureSampleNow().catch((error: unknown) => {
    sampleOnce = null;
    throw error;
  });
  return sampleOnce;
}

async function ensureSampleNow(): Promise<void> {
  if (!supabase) {
    localEnsureSample();
    return;
  }
  const rows = await listSources();
  if (rows.length > 0) return;
  const { error } = await db().from("sources").insert({ name: SAMPLE_NAME, body: SAMPLE_TEXT });
  if (error) throw error;
}

export async function saveSource(input: { id?: string; name: string; body: string }): Promise<void> {
  if (!supabase) {
    localSaveSource(input);
    return;
  }
  const name = sanitizeName(input.name);
  const body = normalizePassage(input.body);
  if (!body) throw new Error("Paste a passage first.");
  const existing = await listSources();
  if (existing.some((row) => row.name.toLowerCase() === name.toLowerCase() && row.id !== input.id)) {
    throw new Error("A source with that name already exists.");
  }
  if (input.id) {
    const { error } = await db().from("sources").update({ name, body, updated_at: new Date().toISOString() }).eq("id", input.id);
    if (error) throw error;
    return;
  }
  const { error } = await db().from("sources").insert({ name, body });
  if (error) throw error;
}

export async function deleteSource(id: string): Promise<void> {
  if (!supabase) {
    localDeleteSource(id);
    return;
  }
  const { error } = await db().from("sources").delete().eq("id", id);
  if (error) throw error;
}

export async function listScores(sourceId: string): Promise<ScoreRow[]> {
  if (!supabase) return localListScores(sourceId);
  const { data, error } = await db()
    .from("scores")
    .select("id,source_id,mode,score,wpm,accuracy,seconds,created_at")
    .eq("source_id", sourceId)
    .order("score", { ascending: false })
    .order("wpm", { ascending: false })
    .order("seconds", { ascending: true })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

export async function recordScore(entry: Omit<ScoreRow, "id" | "created_at">): Promise<number | null> {
  if (!supabase) return localRecordScore(entry);
  const { error } = await db().from("scores").insert(entry);
  if (error) throw error;
  const rows = await listScores(entry.source_id);
  const match = rows.find(
    (row) => row.mode === entry.mode && row.score === entry.score && Math.abs(row.seconds - entry.seconds) < 0.01,
  );
  if (!match) return null;
  const rank = rows.findIndex((row) => row.id === match.id) + 1;
  return rank > 0 && rank <= 100 ? rank : null;
}

export async function listDecks(): Promise<DeckRow[]> {
  if (!supabase) return localListDecks();
  const { data, error } = await db().from("decks").select("id,name,builtin_key,user_id").order("name");
  if (error) throw error;
  const rows = data ?? [];
  rows.sort((a, b) => Number(b.builtin_key != null) - Number(a.builtin_key != null) || a.name.localeCompare(b.name));
  return rows;
}

export async function importDeck(name: string, raw: unknown): Promise<{ id: string; updated: boolean }> {
  const cards = parseDeck(raw);
  const clean = sanitizeName(name);
  if (!supabase) return localImportDeck(clean, raw);
  const existing = (await listDecks()).find((row) => !row.builtin_key && row.name.toLowerCase() === clean.toLowerCase());
  if (existing) {
    await writeCards(existing.id, cards);
    return { id: existing.id, updated: true };
  }
  const { data, error } = await db().from("decks").insert({ name: clean }).select("id").single();
  if (error) throw error;
  await writeCards(data.id as string, cards);
  return { id: data.id as string, updated: false };
}

export async function saveDeck(id: string, name: string, cards: Card[]): Promise<void> {
  const parsed = parseDeck(cards);
  const clean = sanitizeName(name);
  if (!supabase) {
    localSaveDeck(id, clean, parsed);
    return;
  }
  await assertMutable(id);
  const decks = await listDecks();
  if (decks.some((row) => row.id !== id && row.name.toLowerCase() === clean.toLowerCase())) {
    throw new Error("A deck with that name already exists.");
  }
  const renamed = await db().from("decks").update({ name: clean, updated_at: new Date().toISOString() }).eq("id", id);
  if (renamed.error) throw renamed.error;
  await writeCards(id, parsed);
}

export async function replaceDeck(id: string, raw: unknown): Promise<void> {
  const cards = parseDeck(raw);
  if (!supabase) {
    localReplaceCards(id, raw);
    return;
  }
  await assertMutable(id);
  await writeCards(id, cards);
}

async function assertMutable(id: string): Promise<void> {
  const { data, error } = await db().from("decks").select("builtin_key").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("That deck is gone.");
  if (data.builtin_key) throw new Error("Built-in decks stay as they are.");
}

async function writeCards(deckId: string, cards: Card[]): Promise<void> {
  const removed = await db().from("cards").delete().eq("deck_id", deckId);
  if (removed.error) throw removed.error;
  const rows = cards.map((card, position) => ({
    deck_id: deckId,
    position,
    term: card.term,
    definition: card.definition,
    image: card.image,
    enabled: card.enabled !== false,
    card_key: cardKey(card),
  }));
  const inserted = await db().from("cards").insert(rows);
  if (inserted.error) throw enabledColumnError(inserted.error);
}

export async function deleteDeck(id: string): Promise<void> {
  if (!supabase) {
    localDeleteDeck(id);
    return;
  }
  const { error } = await db().from("decks").delete().eq("id", id);
  if (error) throw error;
}

function enabledColumnError(error: { message: string }): Error {
  if (/enabled/i.test(error.message) && /column/i.test(error.message)) {
    return new Error("Run this in the Supabase SQL editor, then save again: alter table public.cards add column if not exists enabled boolean not null default true;");
  }
  return error instanceof Error ? error : new Error(error.message);
}

export async function loadCards(deckId: string): Promise<Card[]> {
  if (!supabase) return localLoadCards(deckId);
  const first = await db()
    .from("cards")
    .select("term,definition,image,position,enabled")
    .eq("deck_id", deckId)
    .order("position");
  if (first.error && /enabled/i.test(first.error.message) && /column/i.test(first.error.message)) {
    const second = await db()
      .from("cards")
      .select("term,definition,image,position")
      .eq("deck_id", deckId)
      .order("position");
    if (second.error) throw second.error;
    return (second.data ?? []).map((row) => ({
      term: row.term,
      definition: row.definition,
      image: row.image ?? "",
      enabled: true,
    }));
  }
  if (first.error) throw first.error;
  return (first.data ?? []).map((row) => ({
    term: row.term,
    definition: row.definition,
    image: row.image ?? "",
    enabled: row.enabled !== false,
  }));
}

export async function loadStats(deckId: string): Promise<Map<string, { e: number; c: number; ls: number }>> {
  if (!supabase) return localLoadStats(deckId);
  const { data, error } = await db().from("card_stats").select("card_key,errors,corrects,last_seen").eq("deck_id", deckId);
  if (error) throw error;
  const map = new Map<string, { e: number; c: number; ls: number }>();
  for (const row of data ?? []) map.set(row.card_key, { e: row.errors, c: row.corrects, ls: Number(row.last_seen) });
  return map;
}

export async function saveStat(deckId: string, key: string, stats: { e: number; c: number; ls: number }): Promise<void> {
  if (!supabase) {
    localSaveStat(deckId, key, stats);
    return;
  }
  const { data: userData, error: userError } = await db().auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) throw new Error("Sign in again.");
  const { error } = await db().from("card_stats").upsert(
    {
      user_id: userId,
      deck_id: deckId,
      card_key: key,
      errors: stats.e,
      corrects: stats.c,
      last_seen: stats.ls,
    },
    { onConflict: "user_id,deck_id,card_key" },
  );
  if (error) throw error;
}

export async function resetStats(deckId: string): Promise<void> {
  if (!supabase) {
    localResetStats(deckId);
    return;
  }
  const { error } = await db().from("card_stats").delete().eq("deck_id", deckId);
  if (error) throw error;
}
