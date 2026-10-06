import type { EngineSnapshot } from "./engine";

const KEY = "memotype.typing";

export type TypingPlace = EngineSnapshot & { sourceId: string; mode: string };

function read(): Record<string, TypingPlace> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, TypingPlace>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function write(places: Record<string, TypingPlace>): void {
  localStorage.setItem(KEY, JSON.stringify(places));
}

export function loadTypingPlace(sourceId: string): TypingPlace | null {
  const place = read()[sourceId];
  if (!place || place.sourceId !== sourceId) return null;
  return place;
}

export function saveTypingPlace(place: TypingPlace): void {
  const places = read();
  places[place.sourceId] = place;
  write(places);
}

export function clearTypingPlace(sourceId: string): void {
  const places = read();
  delete places[sourceId];
  write(places);
}
