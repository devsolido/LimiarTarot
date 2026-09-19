"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, Clipboard, History, RefreshCw, Share2, Sparkles, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { InterpretationLoading } from "./interpretation-loading";
import { OllamaModelSelector } from "./ollama-model-selector";
import { SpreadBoard } from "./spread-board";
import {
  initialInterpretationEstimate,
  updateInterpretationEstimate,
} from "@/lib/interpretation-timing";
import { getCard, getSpreadForReading, meaningFor, themeLabels } from "@/lib/tarot";
import { readHistory } from "@/lib/reading-history";
import type {
  AiInterpretation,
  InterpretationErrorCode,
  InterpretationResponse,
} from "@/types/interpretation";
import type { ReadingSession, TarotSpread } from "@/types/tarot";
import { feedbackVariants, listItemVariants, reducedVariants, stageVariants } from "@/lib/motion";
import { useHydratedReducedMotion } from "@/hooks/use-hydrated-reduced-motion";
import { DEFAULT_DEEPSEEK_MODEL, DEEPSEEK_MODEL_STORAGE_KEY, deepSeekModelLabel, isSupportedDeepSeekModel } from "@/lib/deepseek-models";
import type { DeepSeekModelId } from "@/lib/deepseek-models";
import type { DeepSeekModelsResponse } from "@/types/interpretation";

type AiState =
  | { status: "idle" }
  | { status: "loading"; model: DeepSeekModelId }
  | { status: "success"; result: AiInterpretation; durationMs: number; model: DeepSeekModelId }
  | { status: "fallback"; code: InterpretationErrorCode; message: string };

const errorCopy: Record<InterpretationErrorCode, string> = {
  DEEPSEEK_UNAVAILABLE: "A DeepSeek não está disponível. Verifique a chave da API e tente novamente.",
  MODEL_NOT_AVAILABLE: "O modelo escolhido não está disponível na DeepSeek.",
  TIMEOUT: "A interpretação ultrapassou o limite de tempo estipulado. A leitura básica continua disponível.",
  INVALID_RESPONSE: "A resposta do modelo não passou pela validação das cartas e posições.",
  INVALID_READING: "Esta sessão não possui os dados canônicos necessários para uma interpretação por IA.",
  CANCELLED: "A interpretação foi cancelada. Você pode continuar com a leitura básica ou tentar novamente.",
};

function timingKey(cardCount: number, model: DeepSeekModelId) {
  return `limiar:llm-timing:v2:${model}:${cardCount}`;
}

function loadEstimate(cardCount: number, model: DeepSeekModelId) {
  const fallback = initialInterpretationEstimate(cardCount);
  try {
    const stored = Number(window.localStorage.getItem(timingKey(cardCount, model)));
    return Number.isFinite(stored) && stored > 0 ? stored : fallback;
  } catch {
    return fallback;
  }
}

function formatInterpretation(session: ReadingSession, spread: TarotSpread, interpretation: AiInterpretation) {
  const lines = [
    `${spread.name} — Limiar`,
    `Pergunta: ${session.question}`,
    `Tema: ${themeLabels[session.theme]}`,
    "",
    "Resposta direta",
    interpretation.directAnswer,
    "",
    `Pergunta compreendida: ${interpretation.questionAnalysis.interpretedQuestion}`,
    `Relação com o tema: ${interpretation.questionAnalysis.topicRelation}`,
    `Relação com a tiragem: ${interpretation.questionAnalysis.spreadRelation}`,
    "",
  ];
  interpretation.positions.forEach((item, index) => {
    const card = getCard(item.cardId);
    const position = spread.positions[index];
    lines.push(`${position.name} — ${card?.name || item.cardId}`, item.interpretation, `Contribuição para a resposta: ${item.answerContribution}`, "");
  });
  if (interpretation.connections.length) {
    lines.push("Conexões entre as cartas");
    interpretation.connections.forEach((connection) => {
      const names = connection.cardIds.map((cardId) => getCard(cardId)?.name || cardId).join(" + ");
      lines.push(`${names}: ${connection.interpretation}`);
    });
    lines.push("");
  }
  lines.push("Síntese", interpretation.synthesis, "", "Perguntas para reflexão");
  interpretation.reflectionQuestions.forEach((question) => lines.push(`• ${question}`));
  lines.push("", "Leitura simbólica e reflexiva; não substitui aconselhamento profissional.");
  return lines.join("\n");
}

function PositionEvidence({
  session,
  spread,
  ai,
  reduceMotion,
}: {
  session: ReadingSession;
  spread: TarotSpread;
  ai?: AiInterpretation;
  reduceMotion: boolean;
}) {
  return (
    <div className="ai-position-list">
      {session.cards.map((readingCard, index) => {
        const card = getCard(readingCard.cardId);
        const position = spread.positions.find((item) => item.id === readingCard.positionId);
        const interpretation = ai?.positions[index]?.interpretation;
        const answerContribution = ai?.positions[index]?.answerContribution;
        if (!card || !position) return null;
        const pages = card.source.pageStart === card.source.pageEnd
          ? `p. ${card.source.pageStart}`
          : `p. ${card.source.pageStart}–${card.source.pageEnd}`;
        return (
          <motion.section className="ai-position" key={readingCard.positionId} custom={index} variants={reduceMotion ? reducedVariants : listItemVariants} initial="hidden" animate="visible">
            <div className="ai-position-media">
              <span>{String(position.order).padStart(2, "0")}</span>
              <div><Image src={card.thumbnail} alt={`Carta ${card.name}`} fill sizes="(max-width: 640px) 100px, 145px" /></div>
            </div>
            <div className="ai-reading-copy">
              <small>{position.name}</small>
              <h2>{card.name}</h2>
              <p className="position-description">{position.description}</p>
              {interpretation && <div className="ai-position-interpretation"><span><Sparkles size={14} /> Relação com a pergunta</span><p>{interpretation}</p>{answerContribution && <p className="answer-contribution"><strong>Na resposta:</strong> {answerContribution}</p>}</div>}
              <details className="manual-evidence" open>
                <summary>Evidências do manual</summary>
                <div>
                  <h3>Significado geral</h3>
                  <p>{meaningFor(card, "general")}</p>
                  {session.theme !== "general" && <><h3>{themeLabels[session.theme]}</h3><p>{meaningFor(card, session.theme)}</p></>}
                  <p className="source-line">Fonte: {card.source.documentTitle}, {pages} · Estado editorial: {card.reviewStatus === "approved" ? "aprovado" : "precisa de revisão"}.</p>
                  {card.reviewStatus === "needs-review" && <p className="review-warning"><TriangleAlert size={14} /> Este trecho está sinalizado para revisão editorial.</p>}
                </div>
              </details>
              <Link href={`/cartas/${card.slug}`}>Consultar a ficha completa →</Link>
            </div>
          </motion.section>
        );
      })}
    </div>
  );
}

export function ReadingResult({ id }: { id: string }) {
  const reduceMotion = useHydratedReducedMotion();
  const [session, setSession] = useState<ReadingSession | null | undefined>(undefined);
  const [aiState, setAiState] = useState<AiState>({ status: "idle" });
  const [modelCatalog, setModelCatalog] = useState<DeepSeekModelsResponse>();
  const [selectedModel, setSelectedModel] = useState<DeepSeekModelId>(DEFAULT_DEEPSEEK_MODEL);
  const [modelChoiceRequired, setModelChoiceRequired] = useState(false);
  const [estimateSeconds, setEstimateSeconds] = useState(60);
  const [feedback, setFeedback] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const startedForSession = useRef<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setSession(readHistory().find((item) => item.id === id) || null), 0);
    return () => window.clearTimeout(timer);
  }, [id]);

  const spread = useMemo(() => session ? getSpreadForReading(session.spreadId, session.cards.length) : undefined, [session]);

  // Confirmações de copiar/compartilhar não devem ficar ancoradas na página.
  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(""), 5000);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const refreshModels = useCallback(async () => {
    try {
      const response = await fetch("/api/interpretations", { cache: "no-store" });
      const catalog = await response.json() as DeepSeekModelsResponse;
      if (!catalog.ok || !Array.isArray(catalog.models) || !isSupportedDeepSeekModel(catalog.defaultModel)) {
        throw new Error("Catálogo de modelos inválido.");
      }
      setModelCatalog(catalog);
      let stored: unknown;
      try { stored = window.localStorage.getItem(DEEPSEEK_MODEL_STORAGE_KEY); } catch { stored = null; }
      const savedModel = isSupportedDeepSeekModel(stored) && catalog.models.some((model) => model.id === stored && model.available)
        ? stored
        : catalog.defaultModel;
      const next = catalog.models.find((model) => model.id === savedModel)?.id ?? catalog.defaultModel;
      setModelChoiceRequired(false);
      setSelectedModel(next);
    } catch {
      setFeedback("Não foi possível consultar os modelos da DeepSeek.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refreshModels(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshModels]);

  const requestInterpretation = useCallback(async (currentSession: ReadingSession, currentSpread: TarotSpread, model: DeepSeekModelId) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const estimate = loadEstimate(currentSpread.cardCount, model);
    setEstimateSeconds(estimate);
    setFeedback("");
    setAiState({ status: "loading", model });
    try {
      const response = await fetch("/api/interpretations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({
          question: currentSession.question,
          theme: currentSession.theme,
          spreadId: currentSession.spreadId,
          cards: currentSession.cards,
          model,
        }),
      });
      const payload = await response.json() as InterpretationResponse;
      if (!payload.ok) {
        setAiState({ status: "fallback", code: payload.error.code, message: payload.error.message });
        return;
      }
      const actualSeconds = Math.max(1, payload.durationMs / 1000);
      const nextEstimate = updateInterpretationEstimate(estimate, actualSeconds);
      try { window.localStorage.setItem(timingKey(currentSpread.cardCount, model), String(nextEstimate)); } catch { /* optional metric */ }
      setAiState({ status: "success", result: payload.interpretation, durationMs: payload.durationMs, model: payload.model });
    } catch (error) {
      if (controller.signal.aborted) {
        setAiState({ status: "fallback", code: "CANCELLED", message: errorCopy.CANCELLED });
      } else {
        setAiState({ status: "fallback", code: "OLLAMA_UNAVAILABLE", message: error instanceof Error ? error.message : errorCopy.OLLAMA_UNAVAILABLE });
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!session || !spread || !modelCatalog || modelChoiceRequired || session.mode !== "physical" || !session.physicalDeckConfirmed) return;
    if (startedForSession.current === session.id) return;
    startedForSession.current = session.id;
    const selected = modelCatalog.models.find((model) => model.id === selectedModel);
    if (!selected?.available) {
      const timer = window.setTimeout(() => setAiState({ status: "fallback", code: "MODEL_NOT_AVAILABLE", message: errorCopy.MODEL_NOT_AVAILABLE }), 0);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => { void requestInterpretation(session, spread, selectedModel); }, 0);
    return () => {
      window.clearTimeout(timer);
      controllerRef.current?.abort();
    };
  }, [modelCatalog, modelChoiceRequired, requestInterpretation, selectedModel, session, spread]);

  const selectModel = (model: DeepSeekModelId) => {
    setSelectedModel(model);
    setModelChoiceRequired(false);
    setFeedback("");
    try { window.localStorage.setItem(DEEPSEEK_MODEL_STORAGE_KEY, model); } catch { /* preferência opcional */ }
  };

  const generateWithSelectedModel = () => {
    if (!session || !spread) return;
    setModelChoiceRequired(false);
    startedForSession.current = session.id;
    void requestInterpretation(session, spread, selectedModel);
  };

  if (session === undefined) return <div className="result-recovery-skeleton skeleton" aria-label="Recuperando sua tiragem" aria-busy="true"><span /><span /><span /></div>;
  if (!session) return <div className="empty-state"><span className="eyebrow">Resultado local</span><h1>Esta tiragem não está neste dispositivo.</h1><p>Os resultados ficam apenas no navegador em que foram realizados.</p><Link className="button primary" href="/tiragens">Fazer nova tiragem</Link></div>;
  if (!spread) return <div className="empty-state"><h1>Modalidade indisponível.</h1><Link className="button" href="/tiragens">Voltar às tiragens</Link></div>;

  const modelPanel = <OllamaModelSelector catalog={modelCatalog} selectedModel={selectedModel} busy={aiState.status === "loading"} onSelect={selectModel} onGenerate={generateWithSelectedModel} onRefresh={refreshModels} />;

  if (aiState.status === "loading") return <div className="result-layout">{modelPanel}<InterpretationLoading session={session} spread={spread} modelLabel={deepSeekModelLabel(aiState.model)} estimateSeconds={estimateSeconds} onCancel={() => controllerRef.current?.abort()} /></div>;

  const aiResult = aiState.status === "success" ? aiState.result : undefined;
  const isSimpleAnswer = aiResult?.questionAnalysis.complexity === "simple";
  const shareText = aiResult ? formatInterpretation(session, spread, aiResult) : session.summary;
  const copy = async () => {
    await navigator.clipboard.writeText(shareText);
    setFeedback(aiResult ? "Interpretação copiada." : "Resumo básico copiado.");
  };
  const share = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `${spread.name} — Limiar`, text: shareText });
        setFeedback("Compartilhamento aberto.");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        await copy();
      }
    } else await copy();
  };
  const retry = () => {
    startedForSession.current = session.id;
    void requestInterpretation(session, spread, selectedModel);
  };

  return (
    <motion.article className="result-layout" variants={reduceMotion ? reducedVariants : stageVariants} initial="hidden" animate="visible">
      <header className="result-heading">
        <span className="eyebrow">Resultado · {themeLabels[session.theme]}</span>
        <h1>{spread.name}</h1>
        <blockquote>“{session.question}”</blockquote>
        <div className="notice physical-result-note">{session.mode === "physical" ? "Cartas retiradas do baralho físico e registradas no site na ordem da tiragem." : "Tiragem criada em uma versão anterior do portal, com seleção digital."}</div>
        {session.demonstrationCardId && <div className="notice">Leitura demonstrativa: {getCard(session.demonstrationCardId)?.name} foi fixada e não corresponde a uma carta retirada do baralho.</div>}
      </header>

      {modelPanel}

      <AnimatePresence initial={false}>
      {aiState.status === "fallback" && (
        <motion.section className="ai-error" role="alert" variants={reduceMotion ? reducedVariants : feedbackVariants} initial="hidden" animate="visible" exit="exit">
          <TriangleAlert size={26} />
          <div><span className="eyebrow">Leitura básica ativada</span><h2>A interpretação online não foi concluída</h2><p>{errorCopy[aiState.code] || aiState.message}</p><button className="button" type="button" onClick={retry}><RefreshCw size={16} /> Tentar interpretação por IA novamente</button></div>
        </motion.section>
      )}
      </AnimatePresence>

      {session.mode === "legacy-digital" && <div className="notice">Esta sessão antiga continua disponível na leitura básica, mas não será enviada à IA.</div>}

      <AnimatePresence initial={false}>
      {aiResult && (
        <motion.section className="ai-result-intro" variants={reduceMotion ? reducedVariants : stageVariants} initial="hidden" animate="visible" exit="exit">
          <span className="eyebrow"><Brain size={14} /> Interpretação complementar · {aiState.status === "success" ? deepSeekModelLabel(aiState.model) : "IA online"}</span>
          <h2>Resposta à sua pergunta</h2>
          <p className="direct-answer">{aiResult.directAnswer}</p>
          <p className="answer-synthesis">{aiResult.synthesis}</p>
          <details className="question-analysis-details" open={!isSimpleAnswer}>
            <summary>Como a pergunta foi interpretada</summary>
            <div className="question-analysis">
              <p><strong>O que foi compreendido</strong>{aiResult.questionAnalysis.interpretedQuestion}</p>
              <p><strong>Tema: {themeLabels[session.theme]}</strong>{aiResult.questionAnalysis.topicRelation}</p>
              <p><strong>Como a {spread.name} responde</strong>{aiResult.questionAnalysis.spreadRelation}</p>
            </div>
          </details>
        </motion.section>
      )}
      </AnimatePresence>

      {isSimpleAnswer && aiResult ? (
        <details className="simple-reading-details">
          <summary>Ver cartas, posições e evidências do manual</summary>
          <SpreadBoard spread={spread} cards={session.cards} revealedCardIds={session.cards.map((item) => item.cardId)} />
          <PositionEvidence session={session} spread={spread} ai={aiResult} reduceMotion={reduceMotion} />
          {aiResult.connections.length > 0 && <section className="ai-connections"><span className="eyebrow">Conexões entre as cartas</span><h2>Como o conjunto sustenta a resposta</h2><div>{aiResult.connections.map((connection, index) => <article key={`${connection.cardIds.join("-")}-${index}`}><strong>{connection.cardIds.map((cardId) => getCard(cardId)?.name || cardId).join(" + ")}</strong><p>{connection.interpretation}</p></article>)}</div></section>}
          {aiResult.reflectionQuestions.length > 0 && <section className="reflection-questions"><span className="eyebrow">Se quiser aprofundar</span><ol>{aiResult.reflectionQuestions.map((question) => <li key={question}>{question}</li>)}</ol></section>}
        </details>
      ) : (
        <>
          <SpreadBoard spread={spread} cards={session.cards} revealedCardIds={session.cards.map((item) => item.cardId)} />
          <PositionEvidence session={session} spread={spread} ai={aiResult} reduceMotion={reduceMotion} />
          {aiResult ? <>
            {aiResult.connections.length > 0 && <section className="ai-connections"><span className="eyebrow">Conexões entre as cartas</span><h2>O que emerge do conjunto</h2><div>{aiResult.connections.map((connection, index) => <article key={`${connection.cardIds.join("-")}-${index}`}><strong>{connection.cardIds.map((cardId) => getCard(cardId)?.name || cardId).join(" + ")}</strong><p>{connection.interpretation}</p></article>)}</div></section>}
            {aiResult.reflectionQuestions.length > 0 && <section className="reflection-questions"><span className="eyebrow">Perguntas reflexivas</span><h2>Para continuar a observação</h2><ol>{aiResult.reflectionQuestions.map((question) => <li key={question}>{question}</li>)}</ol></section>}
          </> : <section className="synthesis"><span className="eyebrow">Síntese estruturada</span><h2>Observe as relações, não uma sentença.</h2><p>Esta versão combina somente as posições e os trechos do manual. Ela não acrescenta previsões nem certezas.</p><pre>{session.summary}</pre></section>}
        </>
      )}

      <div className="button-row result-actions"><button className="button primary" onClick={share}><Share2 size={16} /> Compartilhar</button><button className="button" onClick={copy}><Clipboard size={16} /> {aiResult ? "Copiar interpretação" : "Copiar resumo"}</button><Link className="button" href={`/tiragens/${spread.slug}`}><RefreshCw size={16} /> Refazer modalidade</Link><Link className="button" href="/historico"><History size={16} /> Histórico</Link></div>
      <div className="action-feedback" role="status"><AnimatePresence mode="wait" initial={false}>{feedback && <motion.span key={feedback} variants={reduceMotion ? reducedVariants : feedbackVariants} initial="hidden" animate="visible" exit="exit">{feedback}</motion.span>}</AnimatePresence></div>
      <div className="notice">Esta leitura tem finalidade simbólica e reflexiva. Não substitui aconselhamento médico, psicológico, jurídico ou financeiro.</div>
    </motion.article>
  );
}
