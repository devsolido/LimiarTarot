import cardsData from "@/data/tarot-cards.json";
import spreadsData from "@/data/tarot-spreads.json";
import guideData from "@/data/tarot-guide.json";
import type { CardFilters, ReadingCard, TarotCard, TarotSpread, TarotTheme } from "@/types/tarot";

export const tarotCards = cardsData as TarotCard[];
export const tarotSpreads = spreadsData as TarotSpread[];
export const tarotGuide = guideData as Array<{ id: string; title: string; sourcePages: number[]; body: string }>;

export const themeLabels: Record<TarotTheme, string> = {
  general: "Geral",
  future: "Futuro",
  career: "Carreira",
  love: "Amor",
};

export const suitLabels = { cups: "Copas", pentacles: "Ouros", swords: "Espadas", wands: "Paus" } as const;
export const elementLabels = { water: "Água", earth: "Terra", air: "Ar", fire: "Fogo" } as const;
export const rankLabels = { page: "Pajem", knight: "Cavaleiro", queen: "Rainha", king: "Rei" } as const;

export function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

export function filterCards(cards: TarotCard[], filters: CardFilters): TarotCard[] {
  const query = normalizeSearch(filters.query);
  const result = cards.filter((card) => {
    if (filters.arcanaTypes.length && !filters.arcanaTypes.includes(card.arcanaType)) return false;
    if (filters.suits.length && (!card.suit || !filters.suits.includes(card.suit))) return false;
    if (filters.elements.length && (!card.element || !filters.elements.includes(card.element))) return false;
    if (filters.ranks.length && (!card.rank || !filters.ranks.includes(card.rank))) return false;
    if (filters.numbers.length && !filters.numbers.includes(card.number)) return false;
    if (!query) return true;
    const themeText = card.meanings[filters.theme] || "";
    const haystack = normalizeSearch([
      card.name,
      card.number,
      card.suit ? suitLabels[card.suit] : "arcano maior",
      card.element ? elementLabels[card.element] : "",
      card.rank ? rankLabels[card.rank] : "",
      ...card.keywords,
      themeText,
    ].join(" "));
    return haystack.includes(query);
  });
  return [...result].sort((a, b) => {
    if (filters.sort === "name") return a.name.localeCompare(b.name, "pt-BR");
    if (filters.sort === "number") return a.number - b.number || a.deckOrder - b.deckOrder;
    return a.deckOrder - b.deckOrder;
  });
}

export function assignCardsToPositions(cardIds: readonly string[], spread: TarotSpread): ReadingCard[] {
  if (cardIds.length !== spread.cardCount) {
    throw new Error(`A tiragem ${spread.name} exige exatamente ${spread.cardCount} ${spread.cardCount === 1 ? "carta" : "cartas"}.`);
  }
  if (new Set(cardIds).size !== cardIds.length) {
    throw new Error("Uma mesma carta física não pode ocupar duas posições.");
  }
  for (const cardId of cardIds) {
    if (!getCard(cardId)) throw new Error(`Carta desconhecida: ${cardId}`);
  }
  return cardIds.map((cardId, index) => ({ cardId, positionId: spread.positions[index].id }));
}

export function getCard(slugOrId: string): TarotCard | undefined {
  return tarotCards.find((card) => card.slug === slugOrId || card.id === slugOrId);
}

export function getSpread(slugOrId: string): TarotSpread | undefined {
  return tarotSpreads.find((spread) => spread.slug === slugOrId || spread.id === slugOrId);
}

export function isCustomSpread(spread: TarotSpread): boolean {
  return spread.kind === "custom";
}

export function spreadCardCountLabel(spread: TarotSpread): string {
  if (isCustomSpread(spread) && spread.minCardCount && spread.maxCardCount) {
    return `${spread.minCardCount}–${spread.maxCardCount} cartas`;
  }
  return `${spread.cardCount} ${spread.cardCount === 1 ? "carta" : "cartas"}`;
}

function customSpreadPositions(cardCount: number): TarotSpread["positions"] {
  const columns = cardCount <= 6 ? cardCount : Math.ceil(cardCount / 2);
  const rows = cardCount <= 6 ? 1 : 2;
  return Array.from({ length: cardCount }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const itemsInRow = row === rows - 1 ? cardCount - row * columns : columns;
    const x = itemsInRow === 1 ? 50 : 10 + (column / (itemsInRow - 1)) * 80;
    const y = rows === 1 ? 50 : row === 0 ? 31 : 69;
    const rotation = (column - (itemsInRow - 1) / 2) * 1.5;
    const order = index + 1;
    return {
      id: `salto-${order}`,
      order,
      name: `${order}ª carta que saltou`,
      description: order === 1
        ? "O primeiro símbolo que emergiu e abriu a mensagem da sequência."
        : `O ${order}º símbolo deve ser relacionado às cartas anteriores na ordem em que saltou do baralho.`,
      x: Math.round(x * 100) / 100,
      y,
      rotation: Math.round(rotation * 100) / 100,
      orientation: "vertical" as const,
      compactOrder: order,
    };
  });
}

export function getSpreadForReading(slugOrId: string, cardCount?: number): TarotSpread | undefined {
  const spread = getSpread(slugOrId);
  if (!spread || !isCustomSpread(spread)) return spread;
  const count = cardCount ?? spread.cardCount;
  const minimum = spread.minCardCount ?? 4;
  const maximum = spread.maxCardCount ?? 12;
  if (!Number.isInteger(count) || count < minimum || count > maximum) return undefined;
  return { ...spread, cardCount: count, positions: customSpreadPositions(count) };
}

export function getRelatedCards(card: TarotCard, limit = 4): TarotCard[] {
  return tarotCards
    .filter((candidate) => candidate.id !== card.id)
    .map((candidate) => ({
      card: candidate,
      score:
        (candidate.arcanaType === card.arcanaType ? 2 : 0) +
        (candidate.suit && candidate.suit === card.suit ? 4 : 0) +
        (candidate.element && candidate.element === card.element ? 2 : 0) +
        candidate.keywords.filter((keyword) => card.keywords.includes(keyword)).length,
    }))
    .sort((a, b) => b.score - a.score || a.card.deckOrder - b.card.deckOrder)
    .slice(0, limit)
    .map(({ card: related }) => related);
}

export function meaningFor(card: TarotCard, theme: TarotTheme): string {
  return card.meanings[theme]?.trim() || "Este recorte não está informado separadamente no manual e permanece marcado para revisão editorial.";
}

export function buildSummary(question: string, theme: TarotTheme, spread: TarotSpread, readingCards: ReadingCard[]): string {
  const lines = [`Pergunta: ${question}`, `Tema: ${themeLabels[theme]}`, `Tiragem: ${spread.name}`, ""];
  for (const readingCard of readingCards) {
    const card = getCard(readingCard.cardId);
    const position = spread.positions.find((item) => item.id === readingCard.positionId);
    if (!card || !position) continue;
    lines.push(`${position.order}. ${position.name} — ${card.name}`);
    lines.push(`${position.description} ${meaningFor(card, theme)}`);
    lines.push("");
  }
  lines.push("Síntese reflexiva: observe como as posições se relacionam com a pergunta. As cartas descrevem símbolos, influências e possibilidades — não certezas absolutas.");
  return lines.join("\n");
}
