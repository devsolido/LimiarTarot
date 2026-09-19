"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { RotateCcw, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { getCard, getSpread, themeLabels } from "@/lib/tarot";
import { clearHistory, deleteSession, readHistory, writeHistory } from "@/lib/reading-history";
import type { ReadingSession } from "@/types/tarot";
import { feedbackVariants, listItemVariants, reducedVariants } from "@/lib/motion";
import { useHydratedReducedMotion } from "@/hooks/use-hydrated-reduced-motion";

const UNDO_WINDOW_MS = 8000;

type PendingUndo = { label: string; snapshot: ReadingSession[] };

export function HistoryView() {
  const reduceMotion = useHydratedReducedMotion();
  const [sessions, setSessions] = useState<ReadingSession[] | null>(null);
  const [undo, setUndo] = useState<PendingUndo | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const undoTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const timer = window.setTimeout(() => setSessions(readHistory()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => () => window.clearTimeout(undoTimer.current), []);

  useEffect(() => {
    if (!confirmClear) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setConfirmClear(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmClear]);

  const offerUndo = useCallback((label: string, snapshot: ReadingSession[]) => {
    window.clearTimeout(undoTimer.current);
    setUndo({ label, snapshot });
    undoTimer.current = window.setTimeout(() => setUndo(null), UNDO_WINDOW_MS);
  }, []);

  const remove = (session: ReadingSession) => {
    const snapshot = readHistory();
    deleteSession(session.id);
    setSessions(readHistory());
    offerUndo(`Tiragem de ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(session.createdAt))} excluída.`, snapshot);
  };

  const clear = () => {
    const snapshot = readHistory();
    clearHistory();
    setSessions([]);
    setConfirmClear(false);
    offerUndo(`${snapshot.length} ${snapshot.length === 1 ? "tiragem excluída" : "tiragens excluídas"}.`, snapshot);
  };

  const restore = () => {
    if (!undo) return;
    window.clearTimeout(undoTimer.current);
    writeHistory(undo.snapshot);
    setSessions(undo.snapshot);
    setUndo(null);
  };

  const undoBar = (
    <AnimatePresence initial={false}>
      {undo && (
        <motion.div className="history-undo" role="status" variants={reduceMotion ? reducedVariants : feedbackVariants} initial="hidden" animate="visible" exit="exit">
          <span>{undo.label}</span>
          <button className="button ghost" type="button" onClick={restore}><RotateCcw size={15} /> Desfazer</button>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const clearDialog = confirmClear && typeof document !== "undefined" ? createPortal((
    <div className="confirm-layer">
      <button className="confirm-overlay" type="button" aria-label="Cancelar" onClick={() => setConfirmClear(false)} />
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="clear-history-title">
        <div className="confirm-heading">
          <span className="eyebrow"><Trash2 size={14} /> Histórico local</span>
          <button className="icon-button" type="button" aria-label="Fechar confirmação" onClick={() => setConfirmClear(false)}><X size={18} /></button>
        </div>
        <h2 id="clear-history-title">Limpar todo o histórico?</h2>
        <p>As {sessions?.length ?? 0} tiragens salvas neste navegador serão removidas. Você terá alguns segundos para desfazer.</p>
        <div className="button-row">
          <button className="button" type="button" autoFocus onClick={() => setConfirmClear(false)}>Cancelar</button>
          <button className="button danger" type="button" onClick={clear}><Trash2 size={16} /> Limpar tudo</button>
        </div>
      </section>
    </div>
  ), document.body) : null;

  if (sessions === null) {
    return <div className="history-skeleton" aria-label="Carregando histórico" aria-busy="true">{[0, 1].map((item) => <div className="skeleton history-card-skeleton" key={item}><span /><span /><span /></div>)}</div>;
  }

  if (!sessions.length) {
    return (
      <>
        {undoBar}
        <motion.div className="empty-state" variants={reduceMotion ? reducedVariants : feedbackVariants} initial="hidden" animate="visible">
          <h2>Seu histórico está vazio.</h2>
          <p>As tiragens concluídas neste dispositivo aparecerão aqui.</p>
          <Link className="button primary" href="/tiragens">Realizar uma tiragem</Link>
        </motion.div>
      </>
    );
  }

  return (
    <>
      <div className="history-toolbar">
        <motion.p key={sessions.length} variants={reduceMotion ? reducedVariants : feedbackVariants} initial="hidden" animate="visible">
          {sessions.length} {sessions.length === 1 ? "tiragem salva" : "tiragens salvas"}
        </motion.p>
        <button className="button" onClick={() => setConfirmClear(true)}><Trash2 size={15} /> Limpar tudo</button>
      </div>
      {undoBar}
      <motion.div className="history-list">
        <AnimatePresence initial>
          {sessions.map((session, index) => {
            const spread = getSpread(session.spreadId);
            return (
              <motion.article className="history-card" key={session.id} custom={index} variants={reduceMotion ? reducedVariants : listItemVariants} initial="hidden" animate="visible" exit="exit" layout>
                <div>
                  <span className="eyebrow">{new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(session.createdAt))}</span>
                  <h2>{spread?.name || "Tiragem"}</h2>
                  <p>“{session.question}”</p>
                  <div className="history-cards">{session.cards.map((item) => <span key={item.positionId}>{getCard(item.cardId)?.name}</span>)}</div>
                </div>
                <div className="history-actions">
                  <span className="pill">{session.mode === "physical" ? "Baralho físico" : "Versão anterior"}</span>
                  <span className="pill">{themeLabels[session.theme]}</span>
                  <Link className="button" href={`/tiragens/resultado/${session.id}`}>Abrir resultado</Link>
                  <button className="icon-button" onClick={() => remove(session)} aria-label="Excluir esta tiragem"><Trash2 size={17} /></button>
                </div>
              </motion.article>
            );
          })}
        </AnimatePresence>
      </motion.div>
      {clearDialog}
    </>
  );
}
