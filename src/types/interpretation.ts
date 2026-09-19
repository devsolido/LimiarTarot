import type { DeepSeekModelDefinition, DeepSeekModelId } from "@/lib/deepseek-models";

export type InterpretationErrorCode =
  | "DEEPSEEK_UNAVAILABLE"
  | "MODEL_NOT_AVAILABLE"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "INVALID_READING"
  | "CANCELLED";

export interface AiPositionInterpretation {
  positionId: string;
  cardId: string;
  interpretation: string;
  answerContribution: string;
}

export interface AiConnectionInterpretation {
  cardIds: string[];
  interpretation: string;
}

export interface AiInterpretation {
  questionAnalysis: {
    interpretedQuestion: string;
    questionType: "yes-no" | "open" | "decision" | "forecast" | "relationship" | "self-knowledge" | "other";
    complexity: "simple" | "moderate" | "complex";
    topicRelation: string;
    spreadRelation: string;
  };
  directAnswer: string;
  positions: AiPositionInterpretation[];
  connections: AiConnectionInterpretation[];
  synthesis: string;
  reflectionQuestions: string[];
}

export interface InterpretationSuccess {
  ok: true;
  model: DeepSeekModelId;
  durationMs: number;
  interpretation: AiInterpretation;
}

export interface InterpretationFailure {
  ok: false;
  error: {
    code: InterpretationErrorCode;
    message: string;
  };
}

export type InterpretationResponse = InterpretationSuccess | InterpretationFailure;

export interface DeepSeekModelStatus extends DeepSeekModelDefinition {
  available: boolean;
}

export interface DeepSeekModelsResponse {
  ok: true;
  available: boolean;
  defaultModel: DeepSeekModelId;
  models: DeepSeekModelStatus[];
  message?: string;
}
