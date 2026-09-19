"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BrainCircuit, Check, Download, HardDrive, LoaderCircle, RefreshCw, Square, Trash2, TriangleAlert, X } from "lucide-react";
import {
  DEFAULT_OLLAMA_MODEL,
  isSupportedOllamaModel,
  OLLAMA_MODEL_STORAGE_KEY,
} from "@/lib/ollama-models";
import type { OllamaModelId } from "@/lib/ollama-models";
import type { OllamaModelsResponse } from "@/types/interpretation";

interface OllamaPullEvent {
  status?: string;
  completed?: number;
  total?: number;
  error?: string;
}

interface InstallProgress {
  model: OllamaModelId;
  status: string;
  percent?: number;
}

function pullStatus(event: OllamaPullEvent): Omit<InstallProgress, "model"> {
  const status = event.status ?? "Preparando instalação";
  const percent = event.total && event.completed !== undefined
    ? Math.min(100, Math.round((event.completed / event.total) * 100))
    : undefined;

  if (percent !== undefined) return { status: `Baixando arquivos · ${percent}%`, percent };
  if (status === "success") return { status: "Instalação concluída", percent: 100 };
  if (status.includes("manifest")) return { status: "Preparando o download" };
  if (status.includes("verifying")) return { status: "Verificando os arquivos" };
  if (status.includes("writing")) return { status: "Finalizando a instalação" };
  if (status.includes("removing")) return { status: "Limpando arquivos temporários" };
  return { status };
}

function readSavedModel(): OllamaModelId | undefined {
  try {
    const value = window.localStorage.getItem(OLLAMA_MODEL_STORAGE_KEY);
    return isSupportedOllamaModel(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function OllamaModelManager() {
  const [catalog, setCatalog] = useState<OllamaModelsResponse>();
  const [selectedModel, setSelectedModel] = useState<OllamaModelId>(DEFAULT_OLLAMA_MODEL);
  const [busyModel, setBusyModel] = useState<OllamaModelId>();
  const [pendingDelete, setPendingDelete] = useState<OllamaModelId>();
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [installProgress, setInstallProgress] = useState<InstallProgress>();
  const [feedback, setFeedback] = useState("");
  const installController = useRef<AbortController | null>(null);

    const loadModels = useCallback(async () => {
      try {
        const response = await fetch("/api/interpretations", { cache: "no-store" });
        const payload = await response.json() as DeepSeekModelsResponse;
        if (!response.ok || !payload.ok || !Array.isArray(payload.models)) throw new Error("Catálogo de modelos inválido.");
        let saved: unknown;
        try { saved = window.localStorage.getItem(DEEPSEEK_MODEL_STORAGE_KEY); } catch { saved = null; }
        const next = isSupportedDeepSeekModel(saved) && payload.models.some((model) => model.id === saved)
          ? saved
          : payload.defaultModel;
        setCatalog(payload);
        setSelectedModel(next);
      } catch {
        setFeedback("Não foi possível consultar a configuração da DeepSeek.");
      }
    }, []);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadModels(); }, 0);
    return () => {
      window.clearTimeout(timer);
      installController.current?.abort();
    };
  }, [loadModels]);

  const chooseModel = (model: OllamaModelId) => {
    const item = catalog?.models.find((candidate) => candidate.id === model);
    if (!item?.installed) return;

    try {
      window.localStorage.setItem(OLLAMA_MODEL_STORAGE_KEY, model);
    } catch {
      setFeedback("O modelo foi selecionado, mas o navegador não permitiu salvar a preferência.");
      setSelectedModel(model);
      return;
    }

    setSelectedModel(model);
    setFeedback(`${item.label} será usado nas próximas interpretações.`);
  };

  const installModel = async (model: OllamaModelId) => {
    const item = catalog?.models.find((candidate) => candidate.id === model);
    if (!catalog?.available || !item || item.installed) return;

    const controller = new AbortController();
    installController.current = controller;
    setBusyModel(model);
    setInstallProgress({ model, status: "Iniciando o download" });
    setFeedback(`Instalando ${item.label}. Mantenha o Ollama e esta página abertos…`);

    try {
      const response = await fetch("/api/interpretations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = await response.json() as { error?: { message?: string } };
        throw new Error(payload.error?.message || "Não foi possível instalar o modelo.");
      }
      if (!response.body) throw new Error("O Ollama não enviou o progresso da instalação.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;

      const processLine = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as OllamaPullEvent;
        if (event.error) throw new Error(event.error);
        if (event.status === "success") completed = true;
        setInstallProgress({ model, ...pullStatus(event) });
      };

      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach(processLine);
      }
      buffer += decoder.decode();
      processLine(buffer);
      if (!completed) throw new Error("O download terminou sem a confirmação do Ollama.");

      try { window.localStorage.setItem(OLLAMA_MODEL_STORAGE_KEY, model); } catch { /* armazenamento opcional */ }
      await loadModels();
      setFeedback(`${item.label} foi instalado e selecionado para as próximas tiragens.`);
    } catch (error) {
      if (controller.signal.aborted) {
        setFeedback(`Instalação de ${item.label} cancelada. O download pode ser retomado depois.`);
      } else {
        setFeedback(error instanceof Error ? error.message : "Não foi possível instalar o modelo.");
      }
    } finally {
      if (installController.current === controller) installController.current = null;
      setBusyModel(undefined);
      setInstallProgress(undefined);
    }
  };

  const deleteModel = async (model: OllamaModelId) => {
    const item = catalog?.models.find((candidate) => candidate.id === model);
    if (!item?.installed) return;

    setBusyModel(model);
    setFeedback(`Excluindo ${item.label}…`);
    try {
      const response = await fetch("/api/interpretations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      const payload = await response.json() as { ok: boolean; error?: { message?: string } };
      if (!response.ok || !payload.ok) {
        setFeedback(payload.error?.message || "Não foi possível excluir o modelo.");
        return;
      }

      if (readSavedModel() === model) {
        try { window.localStorage.removeItem(OLLAMA_MODEL_STORAGE_KEY); } catch { /* armazenamento opcional */ }
      }
      await loadModels();
      setFeedback(`${item.label} foi excluído do computador.`);
      setPendingDelete(undefined);
      setDeleteConfirmation("");
    } catch {
      setFeedback("Não foi possível acessar o Ollama para excluir o modelo.");
    } finally {
      setBusyModel(undefined);
    }
  };

  const installedCount = catalog?.models.filter((model) => model.installed).length ?? 0;

  return (
    <div className="model-manager">
      <section className="model-manager-status" aria-live="polite">
        <div>
          <span className="eyebrow"><BrainCircuit size={14} /> Gerenciamento pelo frontend</span>
          <h2>Modelo usado nas interpretações</h2>
          <p>A escolha fica salva neste navegador e será aplicada às próximas tiragens.</p>
        </div>
        <div className="model-manager-status-actions">
          <span className={`ollama-status ${catalog?.available ? "online" : "offline"}`}>
            {catalog ? (catalog.available ? `Ollama online · ${installedCount} instalado${installedCount === 1 ? "" : "s"}` : "Ollama offline") : "Consultando Ollama…"}
          </span>
          <button className="button ghost" type="button" disabled={Boolean(busyModel)} onClick={() => void loadModels()}>
            <RefreshCw size={16} /> Atualizar
          </button>
        </div>
      </section>

      {!catalog?.available && catalog && (
        <div className="notice model-manager-offline" role="status">
          <TriangleAlert size={18} /> Abra o Ollama neste computador para instalar, selecionar ou excluir modelos.
        </div>
      )}

      <div className="model-manager-grid" aria-label="Modelos de IA disponíveis">
        {(catalog?.models ?? []).map((model) => {
          const active = model.installed && model.id === selectedModel;
          const deleting = busyModel === model.id;
          const installing = installProgress?.model === model.id;
          return (
            <article className={`model-card ${active ? "active" : ""} ${!model.installed ? "not-installed" : ""}`} key={model.id}>
              <div className="model-card-heading">
                <div>
                  <span className="model-family">{model.family}</span>
                  <h3>{model.label}</h3>
                </div>
                <span className={`model-install-state ${model.installed ? "installed" : ""}`}>
                  {active ? <><Check size={14} /> Ativo</> : model.installed ? "Instalado" : "Não instalado"}
                </span>
              </div>
              <div className="model-card-specs">
                <span><HardDrive size={14} /> {model.size}</span>
                <span>Perfil {model.tier}</span>
                <span>Contexto {model.context}</span>
              </div>
              <p>{model.recommendation}</p>
              {model.installed ? (
                <div className="model-card-actions">
                  <button className={`button ${active ? "ghost" : "primary"}`} type="button" disabled={active || Boolean(busyModel)} onClick={() => chooseModel(model.id)}>
                    {active ? <><Check size={16} /> Modelo ativo</> : <><BrainCircuit size={16} /> Usar nas leituras</>}
                  </button>
                  <button className="button danger" type="button" disabled={Boolean(busyModel)} onClick={() => { setPendingDelete(model.id); setDeleteConfirmation(""); }}>
                    <Trash2 size={16} /> {deleting ? "Excluindo…" : "Excluir do computador"}
                  </button>
                </div>
              ) : (
                <div className="model-card-actions model-install-actions">
                  {installing && (
                    <div className="model-install-progress" role="status">
                      <div><LoaderCircle className="spin" size={15} /><span>{installProgress.status}</span></div>
                      <progress max="100" value={installProgress.percent} aria-label={`Progresso da instalação de ${model.label}`} />
                    </div>
                  )}
                  <button
                    className="button primary"
                    type="button"
                    disabled={!catalog?.available || Boolean(busyModel)}
                    onClick={() => void installModel(model.id)}
                  >
                    {installing ? <><LoaderCircle className="spin" size={16} /> Instalando…</> : <><Download size={16} /> Instalar modelo</>}
                  </button>
                  {installing && (
                    <button className="button ghost" type="button" onClick={() => installController.current?.abort()}>
                      <Square size={14} /> Cancelar
                    </button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {!catalog && <div className="model-manager-loading skeleton" aria-label="Carregando modelos" aria-busy="true"><span /><span /><span /></div>}
      <p className="action-feedback model-manager-feedback" role="status">{feedback}</p>

      {pendingDelete && (() => {
        const model = catalog?.models.find((item) => item.id === pendingDelete);
        if (!model) return null;
        const confirmed = deleteConfirmation.trim() === model.id;
        return createPortal((
          <div className="model-delete-layer">
            <button className="model-delete-overlay" type="button" aria-label="Cancelar exclusão" onClick={() => { setPendingDelete(undefined); setDeleteConfirmation(""); }} />
            <section className="model-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="model-delete-title">
              <div className="model-delete-heading">
                <span className="eyebrow"><Trash2 size={14} /> Exclusão permanente</span>
                <button className="icon-button" type="button" aria-label="Fechar confirmação" onClick={() => { setPendingDelete(undefined); setDeleteConfirmation(""); }}><X size={18} /></button>
              </div>
              <h2 id="model-delete-title">Excluir {model.label}?</h2>
              <p>Isso removerá aproximadamente {model.size} deste computador. Para confirmar, digite <code>{model.id}</code> abaixo.</p>
              <label>
                Nome exato do modelo
                <input className="input" value={deleteConfirmation} autoFocus onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder={model.id} />
              </label>
              <div className="button-row">
                <button className="button" type="button" onClick={() => { setPendingDelete(undefined); setDeleteConfirmation(""); }}>Cancelar</button>
                <button className="button danger" type="button" disabled={!confirmed || Boolean(busyModel)} onClick={() => void deleteModel(model.id)}>
                  <Trash2 size={16} /> {busyModel ? "Excluindo…" : "Confirmar exclusão"}
                </button>
              </div>
            </section>
          </div>
        ), document.body);
      })()}
    </div>
  );
}
