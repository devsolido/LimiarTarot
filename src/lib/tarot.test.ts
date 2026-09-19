import { describe, expect, it } from "vitest";
import { assignCardsToPositions, buildSummary, filterCards, getSpreadForReading, normalizeSearch, spreadCardCountLabel, tarotCards, tarotSpreads } from "./tarot";
import { migrateSession } from "./reading-history";
import type { CardFilters } from "@/types/tarot";

const filters: CardFilters = { query: "", arcanaTypes: [], suits: [], elements: [], ranks: [], numbers: [], theme: "general", sort: "deck" };

describe("conteúdo do tarô", () => {
  it("possui 78 cartas únicas na distribuição correta", () => {
    expect(tarotCards).toHaveLength(78);
    expect(new Set(tarotCards.map((card) => card.id)).size).toBe(78);
    expect(tarotCards.filter((card) => card.arcanaType === "major")).toHaveLength(22);
    expect(tarotCards.filter((card) => card.arcanaType === "minor")).toHaveLength(56);
  });

  it("normaliza acentos e caixa", () => expect(normalizeSearch("  ÁS de ESPADAS ")).toBe("as de espadas"));

  it("combina naipe, arcano e busca temática", () => {
    const result = filterCards(tarotCards, { ...filters, query: "amor", arcanaTypes: ["minor"], suits: ["cups"], theme: "love" });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((card) => card.arcanaType === "minor" && card.suit === "cups")).toBe(true);
  });
});

describe("motor de tiragens", () => {
  it("atribui as cartas físicas às posições na ordem informada", () => {
    const spread = tarotSpreads[0];
    const ids = tarotCards.slice(0, spread.cardCount).map((card) => card.id);
    expect(assignCardsToPositions(ids, spread)).toEqual(spread.positions.map((position, index) => ({ cardId: ids[index], positionId: position.id })));
  });

  it("aceita a quantidade física correta nas oito modalidades", () => {
    for (const spread of tarotSpreads) {
      const ids = tarotCards.slice(0, spread.cardCount).map((card) => card.id);
      const assigned = assignCardsToPositions(ids, spread);
      expect(assigned).toHaveLength(spread.cardCount);
      expect(assigned.map((item) => item.positionId)).toEqual(spread.positions.map((position) => position.id));
    }
  });

  it("oferece tiragens de uma e duas cartas com posições próprias", () => {
    const single = getSpreadForReading("carta-unica");
    const double = getSpreadForReading("duas-cartas");
    expect(single?.cardCount).toBe(1);
    expect(single?.positions.map((position) => position.id)).toEqual(["mensagem-central"]);
    expect(double?.cardCount).toBe(2);
    expect(double?.positions.map((position) => position.id)).toEqual(["mensagem-principal", "complemento"]);
  });

  it("gera de quatro a doze posições para cartas que saltaram", () => {
    for (const count of [4, 5, 8, 12]) {
      const custom = getSpreadForReading("cartas-que-saltaram", count);
      expect(custom?.cardCount).toBe(count);
      expect(custom?.positions).toHaveLength(count);
      expect(custom?.positions.map((position) => position.id)).toEqual(Array.from({ length: count }, (_, index) => `salto-${index + 1}`));
      const assigned = assignCardsToPositions(tarotCards.slice(0, count).map((card) => card.id), custom!);
      expect(assigned).toHaveLength(count);
    }
    expect(getSpreadForReading("cartas-que-saltaram", 3)).toBeUndefined();
    expect(getSpreadForReading("cartas-que-saltaram", 13)).toBeUndefined();
    expect(spreadCardCountLabel(getSpreadForReading("cartas-que-saltaram", 4)!)).toBe("4–12 cartas");
  });

  it("impede que a mesma carta física ocupe duas posições", () => {
    const spread = tarotSpreads.find((item) => item.cardCount === 3)!;
    expect(() => assignCardsToPositions([tarotCards[0].id, tarotCards[0].id, tarotCards[1].id], spread)).toThrow(/mesma carta física/);
  });

  it("gera síntese apenas com posição e significado selecionado", () => {
    const spread = tarotSpreads[0];
    const reading = spread.positions.map((position, index) => ({ cardId: tarotCards[index].id, positionId: position.id }));
    const summary = buildSummary("Como compreender este momento?", "career", spread, reading);
    expect(summary).toContain("Carreira");
    expect(summary).toContain(spread.positions[0].name);
    expect(summary).toContain(tarotCards[0].meanings.career);
    expect(summary).not.toContain(tarotCards[0].meanings.love);
  });

  it("migra sessões digitais antigas sem identificá-las como tiragem física", () => {
    const migrated = migrateSession({
      schemaVersion: 1,
      id: "antiga",
      question: "Como compreender este momento?",
      theme: "general",
      spreadId: tarotSpreads[0].id,
      mode: "automatic",
      deckOrder: tarotCards.map((card) => card.id),
      cards: [{ cardId: tarotCards[0].id, positionId: tarotSpreads[0].positions[0].id }],
      revealedCardIds: [tarotCards[0].id],
      summary: "Resumo anterior",
      createdAt: "2026-07-15T00:00:00.000Z",
    });
    expect(migrated?.schemaVersion).toBe(2);
    expect(migrated?.mode).toBe("legacy-digital");
    expect(migrated?.physicalDeckConfirmed).toBe(false);
  });
});
