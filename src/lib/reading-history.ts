import type { ReadingSession, TarotTheme } from "@/types/tarot";

const STORAGE_KEY = "limiar:readings:v2";
const LEGACY_STORAGE_KEY = "limiar:readings:v1";

type StoredSession = Partial<ReadingSession> & {
  schemaVersion?: number;
  mode?: string;
  deckOrder?: string[];
};

export function migrateSession(value: unknown): ReadingSession | null {
  if (!value || typeof value !== "object") return null;
  const session = value as StoredSession;
  if (
    typeof session.id !== "string" ||
    typeof session.question !== "string" ||
    typeof session.spreadId !== "string" ||
    typeof session.createdAt !== "string" ||
    typeof session.summary !== "string" ||
    !Array.isArray(session.cards) ||
    !Array.isArray(session.revealedCardIds) ||
    !["general", "future", "career", "love"].includes(session.theme || "")
  ) return null;

  return {
    schemaVersion: 2,
    id: session.id,
    question: session.question,
    theme: session.theme as TarotTheme,
    spreadId: session.spreadId,
    mode: session.schemaVersion === 2 && session.mode === "physical" ? "physical" : "legacy-digital",
    physicalDeckConfirmed: session.schemaVersion === 2 && session.physicalDeckConfirmed === true,
    cards: session.cards as ReadingSession["cards"],
    revealedCardIds: session.revealedCardIds as string[],
    summary: session.summary,
    demonstrationCardId: typeof session.demonstrationCardId === "string" ? session.demonstrationCardId : undefined,
    createdAt: session.createdAt,
  };
}

export function readHistory(): ReadingSession[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY) ?? "[]";
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(migrateSession).filter((session): session is ReadingSession => session !== null);
  } catch {
    return [];
  }
}

export function saveSession(session: ReadingSession): void {
  const history = readHistory().filter((item) => item.id !== session.id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([session, ...history].slice(0, 50)));
}

/** Regrava o histórico inteiro preservando a ordem — usado para desfazer exclusões. */
export function writeHistory(sessions: ReadingSession[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 50)));
}

export function deleteSession(id: string): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(readHistory().filter((session) => session.id !== id)));
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}