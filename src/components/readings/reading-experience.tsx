"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, CornerDownLeft, Hand, RotateCcw, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { SpreadBoard } from "./spread-board";
import { ReadingModelPicker } from "./reading-model-picker";
import {
  assignCardsToPositions,
  buildSummary,
  getCard,
  getSpreadForReading,
  isCustomSpread,
  normalizeSearch,
  suitLabels,
  tarotCards,
  themeLabels,
} from "@/lib/tarot";
import { clearDraft, readDraft, writeDraft } from "@/lib/reading-draft";
import { saveSession } from "@/lib/reading-history";
import type { ReadingStage as Stage } from "@/lib/reading-draft";
import type { ArcanaType, ReadingSession, TarotSpread, TarotSuit, TarotTheme } from "@/types/tarot";
import { reducedVariants, stageVariants } from "@/lib/motion";
import { useHydratedReducedMotion } from "@/hooks/use-hydrated-reduced-motion";

const stageLabels: Record<Stage, string> = {
  configure: "Pergunta",
  prepare: "Baralho físico",
  select: "Registrar cartas",
  review: "Revisar",
};

const stageOrder: Stage[] = ["configure", "prepare", "select", "review"];

const suggestions = [
  "O que preciso compreender sobre minha carreira neste momento?",
  "Quais fatores estão influenciando este relacionamento?",
  "Como posso lidar melhor com este desafio?",
  "Qual tendência está se formando para os próximos meses?",
];

export function ReadingExperience({ spread }: { spread: TarotSpread }) {
  const router = useRouter();
  const reduceMotion = useHydratedReducedMotion();

  const [stage, setStage] = useState<Stage>("configure");
  const [question, setQuestion] = useState("");
  const [theme, setTheme] = useState<TarotTheme>("general");
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [arcanaFilter, setArcanaFilter] = useState<"all" | ArcanaType>("all");
  const [suitFilter, setSuitFilter] = useState<"all" | TarotSuit>("all");
  const [error, setError] = useState("");
  const [customCardCount, setCustomCardCount] = useState(spread.minCardCount ?? spread.cardCount);
  const [draftReady, setDraftReady] = useState(false);
  const [resumed, setResumed] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const focusKey = useRef<string | null>(null);
  const activeSpread = useMemo(
    () => getSpreadForReading(spread.id, isCustomSpread(spread) ? customCardCount : spread.cardCount) ?? spread,
    [customCardCount, spread],
  );

  const currentPosition = activeSpread.positions[selected.length];
  const readingCards = useMemo(
    () => selected.length === activeSpread.cardCount ? assignCardsToPositions(selected, activeSpread) : [],
    [selected, activeSpread],
  );

  const visibleCards = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    return tarotCards.filter((card) => {
      if (selected.includes(card.id)) return false;
      if (arcanaFilter !== "all" && card.arcanaType !== arcanaFilter) return false;
      if (suitFilter !== "all" && card.suit !== suitFilter) return false;
      if (!normalizedQuery) return true;
      const haystack = normalizeSearch([
        card.name,
        card.number,
        card.suit ? suitLabels[card.suit] : "Arcano Maior",
        ...card.keywords,
      ].join(" "));
      return haystack.includes(normalizedQuery);
    });
  }, [arcanaFilter, query, selected, suitFilter]);

  // Retomada do rascunho: o estado inicial precisa ser igual no SSR e no primeiro
  // render do navegador, então a leitura do localStorage acontece só depois.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const draft = readDraft(spread.id);
      if (draft) {
        // A modalidade pode ter mudado desde que o rascunho foi salvo, então a
        // sequência é limitada ao número de posições que existe hoje.
        const draftSpread = getSpreadForReading(spread.id, isCustomSpread(spread) ? draft.customCardCount : spread.cardCount) ?? spread;
        const cards = draft.selected.slice(0, draftSpread.cardCount);
        setQuestion(draft.question);
        setTheme(draft.theme);
        setSelected(cards);
        setCustomCardCount(draft.customCardCount);
        setStage(draft.stage === "select" && cards.length === draftSpread.cardCount ? "review" : draft.stage);
        setResumed(draft.stage !== "configure" || draft.question.trim().length > 0);
      }
      setDraftReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [spread]);

  useEffect(() => {
    if (!draftReady) return;
    if (!question.trim() && selected.length === 0) {
      clearDraft(spread.id);
      return;
    }
    writeDraft(spread.id, { question, theme, selected, customCardCount, stage });
  }, [customCardCount, draftReady, question, selected, spread.id, stage, theme]);

  // Cada etapa e cada carta registrada trocam o conteúdo no topo do painel; sem
  // reposicionar, quem está no fim da grade não vê a posição seguinte.
  useEffect(() => {
    const key = `${stage}:${selected.length}`;
    if (focusKey.current === null) {
      focusKey.current = key;
      return;
    }
    if (focusKey.current === key) return;
    focusKey.current = key;
    shellRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    if (stage === "select") searchRef.current?.focus();
  }, [reduceMotion, selected.length, stage]);

  const startPreparation = () => {
    if (question.trim().length < 10) {
      setError("Escreva uma pergunta aberta com um pouco mais de contexto.");
      return;
    }
    setError("");
    setSelected((current) => current.slice(0, activeSpread.cardCount));
    setStage("prepare");
  };

  const beginSelection = () => {
    if (selected.length === activeSpread.cardCount) setStage("review");
    else setStage("select");
  };

  const chooseCard = (cardId: string) => {
    if (selected.includes(cardId) || selected.length >= activeSpread.cardCount) return;
    const next = [...selected, cardId];
    setSelected(next);
    setQuery("");
    if (next.length === activeSpread.cardCount) setStage("review");
  };

  const changeFrom = (index: number) => {
    setSelected((current) => current.slice(0, index));
    setStage("select");
  };

  const goToStage = (target: Stage) => {
    if (stageOrder.indexOf(target) >= stageOrder.indexOf(stage)) return;
    setError("");
    // "Registrar cartas" só tem o que mostrar enquanto houver posição em aberto.
    if (target === "select" && selected.length >= activeSpread.cardCount) changeFrom(activeSpread.cardCount - 1);
    else setStage(target);
  };

  const restart = () => {
    clearDraft(spread.id);
    setQuestion("");
    setTheme("general");
    setSelected([]);
    setQuery("");
    setError("");
    setCustomCardCount(spread.minCardCount ?? spread.cardCount);
    setStage("configure");
    setResumed(false);
  };

  const finish = () => {
    if (readingCards.length !== activeSpread.cardCount) return;
    const id = crypto.randomUUID();
    const summary = buildSummary(question, theme, activeSpread, readingCards);
    const session: ReadingSession = {
      schemaVersion: 2,
      id,
      question,
      theme,
      spreadId: spread.id,
      mode: "physical",
      physicalDeckConfirmed: true,
      cards: readingCards,
      revealedCardIds: readingCards.map((item) => item.cardId),
      summary,
      createdAt: new Date().toISOString(),
    };
    saveSession(session);
    clearDraft(spread.id);
    router.push(`/tiragens/resultado/${id}`);
  };

  const currentStageIndex = stageOrder.indexOf(stage);
  const nextOnEnter = query.trim() ? visibleCards[0] : undefined;

  return (
    <div className="reading-shell" ref={shellRef}>
      <ol className="reading-progress" aria-label={`Etapa atual: ${stageLabels[stage]}`}>
        {stageOrder.map((item, index) => {
          const isActive = item === stage;
          const isDone = index < currentStageIndex;
          return (
            <li key={item} className={isActive ? "active" : isDone ? "done" : ""} aria-current={isActive ? "step" : undefined}>
              <button
                type="button"
                disabled={!isDone}
                onClick={() => goToStage(item)}
                aria-label={isDone ? `Voltar para ${stageLabels[item]}` : stageLabels[item]}
              >
                <span aria-hidden="true">{index + 1}</span><small>{stageLabels[item]}</small>
              </button>
            </li>
          );
        })}
      </ol>

      <AnimatePresence initial={false}>
        {resumed && (
          <motion.div className="notice reading-resume" role="status" variants={reduceMotion ? reducedVariants : stageVariants} initial="hidden" animate="visible" exit="exit">
            <RotateCcw size={17} aria-hidden="true" />
            <span>Retomamos esta tiragem de onde você parou{selected.length > 0 && ` — ${selected.length} ${selected.length === 1 ? "carta registrada" : "cartas registradas"}`}.</span>
            <div className="button-row">
              <button className="button ghost" type="button" onClick={() => setResumed(false)}>Continuar</button>
              <button className="button ghost" type="button" onClick={restart}>Recomeçar</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div className="reading-stage-transition" key={stage} variants={reduceMotion ? reducedVariants : stageVariants} initial="hidden" animate="visible" exit="exit">
      {stage === "configure" && (
        <section className="reading-panel">
          <span className="eyebrow">Prepare sua leitura</span>
          <h2>O que você deseja compreender?</h2>
          <div className="notice physical-notice"><Hand size={20} aria-hidden="true" /><span>Esta tiragem usa um <strong>baralho físico</strong>. O site não embaralha nem sorteia cartas: você vai tirá-las com as próprias mãos e registrá-las aqui.</span></div>
          <ReadingModelPicker />
          <label>Escreva uma pergunta aberta<textarea className="textarea" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ex.: O que preciso compreender sobre este momento?" /></label>
          <div className="suggestion-list" aria-label="Perguntas sugeridas">{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => setQuestion(suggestion)}>{suggestion}</button>)}</div>
          <fieldset><legend>Contexto da interpretação</legend><div className="option-grid">{(Object.entries(themeLabels) as [TarotTheme, string][]).map(([value, label]) => <label className={theme === value ? "selected" : ""} key={value}><input type="radio" name="theme" checked={theme === value} onChange={() => setTheme(value)} /><span>{label}</span></label>)}</div></fieldset>
          {isCustomSpread(spread) && <label className="custom-count-field">Quantas cartas saltaram do baralho?<select className="select" value={customCardCount} onChange={(event) => setCustomCardCount(Number(event.target.value))}>{Array.from({ length: (spread.maxCardCount ?? 12) - (spread.minCardCount ?? 4) + 1 }, (_, index) => (spread.minCardCount ?? 4) + index).map((count) => <option value={count} key={count}>{count} cartas</option>)}</select><small>Registre entre {spread.minCardCount ?? 4} e {spread.maxCardCount ?? 12} cartas, exatamente na ordem em que saltaram.</small></label>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button primary" onClick={startPreparation}>Preparar baralho físico <ChevronRight size={17} /></button>
        </section>
      )}

      {stage === "prepare" && (
        <section className="reading-panel physical-stage">
          <div className="physical-hand" aria-hidden="true"><Hand size={54} /></div>
          <span className="eyebrow">Faça esta etapa fora do site</span>
          <h2>{isCustomSpread(spread) ? `Separe as ${activeSpread.cardCount} cartas que saltaram.` : `Tire ${activeSpread.cardCount} ${activeSpread.cardCount === 1 ? "carta" : "cartas"} com as próprias mãos.`}</h2>
          <p>Mantenha as cartas sobre a mesa na ordem em que saíram. Essa ordem será associada às posições de <strong>{activeSpread.name}</strong>.</p>
          <ol className="physical-steps">
            <li><span>01</span><div><strong>Concentre-se na pergunta</strong><small>Leia-a novamente e reserve um momento de atenção.</small></div></li>
            <li><span>02</span><div><strong>Embaralhe e corte o baralho real</strong><small>Use o método que fizer sentido para sua prática.</small></div></li>
            <li><span>03</span><div><strong>Retire as cartas em sequência</strong><small>Não altere a ordem; ela define qual carta ocupa cada posição.</small></div></li>
          </ol>
          <blockquote>“{question}”</blockquote>
          <div className="button-row">
            <button className="button" onClick={() => setStage("configure")}><ChevronLeft size={17} /> Voltar</button>
            <button className="button primary" onClick={beginSelection}>{selected.length > 0 ? "Continuar o registro" : "Já tirei minhas cartas"} <ChevronRight size={17} /></button>
          </div>
        </section>
      )}

      {stage === "select" && currentPosition && (
        <section className="reading-panel selection-stage">
          <div className="selection-heading">
            <div><span className="eyebrow">Registre na ordem da mesa</span><h2>{currentPosition.order}. {currentPosition.name}</h2><p>{currentPosition.description}</p></div>
            <strong>{selected.length} de {activeSpread.cardCount}</strong>
          </div>

          {selected.length > 0 && <div className="selected-sequence" aria-label="Cartas já registradas">{selected.map((cardId, index) => {
            const card = getCard(cardId); const position = activeSpread.positions[index];
            if (!card || !position) return null;
            return <div key={position.id}><span>{position.order}</span><div><small>{position.name}</small><strong>{card.name}</strong></div><button onClick={() => changeFrom(index)}>Alterar</button></div>;
          })}</div>}

          <div className="card-picker-tools">
            <label className="search-field"><Search size={17} aria-hidden="true" /><span className="sr-only">Buscar a carta física pelo nome</span><input ref={searchRef} className="input" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key !== "Enter") return; event.preventDefault(); if (nextOnEnter) chooseCard(nextOnEnter.id); }} placeholder="Busque pelo nome da carta que você tirou" autoFocus /></label>
            <select className="select" aria-label="Filtrar por tipo de arcano" value={arcanaFilter} onChange={(event) => setArcanaFilter(event.target.value as "all" | ArcanaType)}><option value="all">Todos os arcanos</option><option value="major">Arcanos Maiores</option><option value="minor">Arcanos Menores</option></select>
            <select className="select" aria-label="Filtrar por naipe" value={suitFilter} onChange={(event) => setSuitFilter(event.target.value as "all" | TarotSuit)}><option value="all">Todos os naipes</option>{Object.entries(suitLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
          </div>

          <p className="picker-status" role="status">{visibleCards.length} {visibleCards.length === 1 ? "carta disponível" : "cartas disponíveis"}. Escolha a carta física colocada nesta posição.{nextOnEnter && <span className="picker-hint"><CornerDownLeft size={13} aria-hidden="true" /> Enter registra <strong>{nextOnEnter.name}</strong></span>}</p>
          {visibleCards.length > 0 ? <div className="physical-card-picker">{visibleCards.map((card) => <button type="button" className={card.id === nextOnEnter?.id ? "is-next" : ""} key={card.id} onClick={() => chooseCard(card.id)} aria-label={`Selecionar ${card.name} para ${currentPosition.name}`}><span><Image src={card.thumbnail} alt="" fill sizes="(max-width: 640px) 42vw, 140px" /></span><strong>{card.name}</strong><small>{card.arcanaType === "major" ? "Arcano Maior" : card.suit ? suitLabels[card.suit] : "Arcano Menor"}</small></button>)}</div> : <div className="empty-state"><h3>Nenhuma carta encontrada.</h3><p>Revise o nome ou limpe os filtros.</p><button className="button" type="button" onClick={() => { setQuery(""); setArcanaFilter("all"); setSuitFilter("all"); }}>Limpar busca e filtros</button></div>}
          <div className="button-row selection-footer">
            <button className="button" type="button" onClick={() => setStage("prepare")}><ChevronLeft size={16} /> Voltar</button>
            <button className="button ghost undo-selection" onClick={() => changeFrom(Math.max(0, selected.length - 1))} disabled={selected.length === 0}><RotateCcw size={16} /> Desfazer última carta</button>
          </div>
        </section>
      )}

      {stage === "review" && (
        <section className="reading-panel review-stage">
          <span className="eyebrow">Confira antes de interpretar</span>
          <h2>Estas são as cartas da sua mesa física?</h2>
          <p>A ordem abaixo corresponde às posições da tiragem. Se algo estiver diferente, volte à posição que deseja corrigir.</p>
          <SpreadBoard spread={activeSpread} cards={readingCards} revealedCardIds={selected} />
          <div className="physical-review-list">{readingCards.map((readingCard, index) => {
            const card = getCard(readingCard.cardId); const position = activeSpread.positions[index];
            if (!card) return null;
            return <div key={position.id}><span>{position.order}</span><div><small>{position.name}</small><strong>{card.name}</strong></div><button onClick={() => changeFrom(index)}>Alterar</button></div>;
          })}</div>
          <div className="button-row review-actions"><button className="button" onClick={() => changeFrom(Math.max(0, selected.length - 1))}>Corrigir cartas</button><button className="button primary" onClick={finish}><Check size={16} /> Gerar interpretação</button></div>
        </section>
      )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
