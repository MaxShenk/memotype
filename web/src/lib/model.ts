export const BUILTIN_DECK_ID = "00000000-0000-4000-8000-000000000001";

export type SourceRow = { id: string; name: string; body: string; updated_at: string };
export type ScoreRow = {
  id: string;
  source_id: string;
  mode: string;
  score: number;
  wpm: number;
  accuracy: number | null;
  seconds: number;
  created_at: string;
};
export type DeckRow = { id: string; name: string; builtin_key: string | null; user_id: string | null };

export function sanitizeName(name: string): string {
  const cleaned = name.trim().replace(/\s+/g, " ").slice(0, 80);
  return cleaned || "Untitled";
}
