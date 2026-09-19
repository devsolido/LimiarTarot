import { NextResponse } from "next/server";
import { generateDeepSeekInterpretation, InterpretationServiceError } from "@/lib/ollama-interpretation";
import { DEFAULT_DEEPSEEK_MODEL, DEEPSEEK_MODELS, isSupportedDeepSeekModel } from "@/lib/deepseek-models";
import type { DeepSeekModelsResponse, InterpretationFailure } from "@/types/interpretation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function configuredDefaultModel() {
  return isSupportedDeepSeekModel(process.env.DEEPSEEK_MODEL) ? process.env.DEEPSEEK_MODEL : DEFAULT_DEEPSEEK_MODEL;
}

export async function GET() {
  const defaultModel = configuredDefaultModel();
  const result: DeepSeekModelsResponse = {
    ok: true,
    available: Boolean(process.env.DEEPSEEK_API_KEY),
    defaultModel,
    models: DEEPSEEK_MODELS.map((model) => ({ ...model, available: Boolean(process.env.DEEPSEEK_API_KEY) })),
    ...(process.env.DEEPSEEK_API_KEY ? {} : { message: "Configure DEEPSEEK_API_KEY no servidor para ativar a interpretação online." }),
  };
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await generateDeepSeekInterpretation(body, { signal: request.signal });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const known = error instanceof InterpretationServiceError
      ? error
      : new InterpretationServiceError("INVALID_READING", "Não foi possível processar esta leitura.", 400);
    const response: InterpretationFailure = { ok: false, error: { code: known.code, message: known.message } };
    return NextResponse.json(response, { status: known.status, headers: { "Cache-Control": "no-store" } });
  }
}
