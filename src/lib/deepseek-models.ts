export const DEEPSEEK_MODEL_IDS = ["deepseek-chat", "deepseek-reasoner"] as const;

export type DeepSeekModelId = typeof DEEPSEEK_MODEL_IDS[number];

export interface DeepSeekModelDefinition {
  id: DeepSeekModelId;
  label: string;
  profile: string;
  context: string;
  recommendation: string;
}

export const DEFAULT_DEEPSEEK_MODEL: DeepSeekModelId = "deepseek-chat";
export const DEEPSEEK_MODEL_STORAGE_KEY = "limiar:deepseek-model:v1";

export const DEEPSEEK_MODELS: readonly DeepSeekModelDefinition[] = [
  {
    id: "deepseek-chat",
    label: "DeepSeek Chat",
    profile: "Equilibrado",
    context: "64K",
    recommendation: "Resposta rápida e consistente para a maioria das tiragens.",
  },
  {
    id: "deepseek-reasoner",
    label: "DeepSeek Reasoner",
    profile: "Raciocínio profundo",
    context: "64K",
    recommendation: "Mais reflexão para tiragens longas e perguntas complexas; pode demorar mais.",
  },
] as const;

export function isSupportedDeepSeekModel(value: unknown): value is DeepSeekModelId {
  return typeof value === "string" && (DEEPSEEK_MODEL_IDS as readonly string[]).includes(value);
}

export function getDeepSeekModel(value: string): DeepSeekModelDefinition | undefined {
  return DEEPSEEK_MODELS.find((model) => model.id === value);
}

export function deepSeekModelLabel(value: string): string {
  return getDeepSeekModel(value)?.label ?? value;
}