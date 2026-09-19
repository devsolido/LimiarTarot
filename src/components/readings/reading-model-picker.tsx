"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BrainCircuit, Check, RefreshCw, Settings2 } from "lucide-react";
import {
  DEFAULT_DEEPSEEK_MODEL,
  DEEPSEEK_MODEL_STORAGE_KEY,
  isSupportedDeepSeekModel,
} from "@/lib/deepseek-models";
import type { DeepSeekModelId } from "@/lib/deepseek-models";
import type { DeepSeekModelsResponse } from "@/types/interpretation";

export function ReadingModelPicker() {
  const [catalog, setCatalog] = useState<DeepSeekModelsResponse>();
  const [selectedModel, setSelectedModel] = useState<DeepSeekModelId>(DEFAULT_DEEPSEEK_MODEL);
  const [feedback, setFeedback] = useState("");
  const [notice, setNotice] = useState("");

  // O erro do catálogo permanece até ser resolvido; a confirmação da troca some sozinha.
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const loadModels = useCallback(async () => {
    try {
      const response = await fetch("/api/interpretations", { cache: "no-store" });
      const payload = await response.json() as DeepSeekModelsResponse;
      if (!response.ok || !payload.ok || !Array.isArray(payload.models)) throw new Error("Catálogo inválido.");

      let saved: unknown;
      try { saved = window.localStorage.getItem(DEEPSEEK_MODEL_STORAGE_KEY); } catch { saved = null; }
      const next = isSupportedDeepSeekModel(saved) && payload.models.some((model) => model.id === saved)
        ? saved
        : payload.defaultModel;

      setCatalog(payload);
      setSelectedModel(next);
      setFeedback("");
    } catch {
      setFeedback("A DeepSeek não está configurada. A leitura básica continuará disponível.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadModels(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadModels]);

  const selected = catalog?.models.find((model) => model.id === selectedModel);

  const chooseModel = (model: DeepSeekModelId) => {
    const item = catalog?.models.find((candidate) => candidate.id === model);
    if (!item) return;
    setSelectedModel(model);
    try {
      window.localStorage.setItem(DEEPSEEK_MODEL_STORAGE_KEY, model);
      setNotice(`${item.label} selecionado para esta e as próximas tiragens.`);
    } catch {
      setNotice(`${item.label} selecionado para esta tiragem, mas a preferência não pôde ser salva.`);
    }
  };

  return (
    <section className="reading-model-picker" aria-labelledby="reading-model-title">
      <div className="reading-model-copy">
        <span className="eyebrow"><BrainCircuit size={14} /> IA da interpretação</span>
        <h3 id="reading-model-title">Qual modelo deve interpretar esta tiragem?</h3>
        <p>A interpretação é feita online pela DeepSeek. Escolha o modelo que melhor combina com sua tiragem.</p>
      </div>

      <div className="reading-model-control">
        <label>
          Modelo ativo
          <select
            className="select"
            aria-label="Modelo para esta tiragem"
            value={selectedModel}
            disabled={!catalog}
            onChange={(event) => chooseModel(event.target.value as DeepSeekModelId)}
          >
            {(catalog?.models ?? []).map((model) => (
              <option value={model.id} key={model.id}>{model.label} · {model.profile}</option>
            ))}
          </select>
        </label>
        <div className="reading-model-links">
          <Link className="button ghost" href="/modelos"><Settings2 size={16} /> Configurar IA</Link>
          <button className="button ghost" type="button" onClick={() => void loadModels()} aria-label="Atualizar modelos online"><RefreshCw size={16} /></button>
        </div>
      </div>

      {selected && <p className="reading-model-current"><Check size={15} /> <strong>{selected.label}</strong> será usado quando a interpretação for gerada.</p>}
      {(notice || feedback) && <p className="reading-model-feedback" role="status">{notice || feedback}</p>}
    </section>
  );
}
