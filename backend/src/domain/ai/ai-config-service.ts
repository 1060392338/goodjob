import type { CrmStore } from "../../store.js";
import { getStore } from "../../store.js";
import type { AiModelConfig, SessionUser } from "../../types.js";
import { ModelGatewayError, type ModelGateway } from "../../gateways/model-gateway.js";

export type AiUseCase = "leadFinder" | "websiteParse" | "scoring" | "emailDraft" | "exam";

export function getAiConfigs(user: SessionUser, store: CrmStore = getStore()) {
  return store.aiModelConfigs
    .filter((item) => item.ownerId === user.id)
    .sort((left, right) => Number(right.enabled) - Number(left.enabled) || new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function configSupportsUseCase(config: AiModelConfig, useCase?: AiUseCase) {
  if (!useCase) return true;
  const map: Record<AiUseCase, keyof AiModelConfig> = {
    leadFinder: "useLeadFinder",
    websiteParse: "useWebsiteParse",
    scoring: "useScoring",
    emailDraft: "useEmailDraft",
    exam: "useExam"
  };
  return Boolean(config[map[useCase]]);
}

export function getAiConfig(user: SessionUser, useCase?: AiUseCase, store: CrmStore = getStore()) {
  const configs = getAiConfigs(user, store);
  return configs.find((item) => item.enabled && item.apiKey && configSupportsUseCase(item, useCase))
    || configs.find((item) => configSupportsUseCase(item, useCase))
    || configs[0]
    || null;
}

export function publicAiConfig(config: AiModelConfig) {
  return {
    id: config.id,
    provider: config.provider,
    protocol: config.protocol || "openai-compatible",
    name: config.name,
    baseUrl: config.baseUrl,
    model: config.model,
    apiKey: config.apiKey ? `****${config.apiKey.slice(-4)}` : "",
    hasApiKey: Boolean(config.apiKey),
    enabled: config.enabled,
    temperature: config.temperature ?? 0.1,
    useLeadFinder: config.useLeadFinder ?? true,
    useWebsiteParse: config.useWebsiteParse ?? true,
    useScoring: config.useScoring ?? true,
    useEmailDraft: config.useEmailDraft ?? true,
    useExam: config.useExam ?? false,
    lastTestAt: config.lastTestAt || "",
    lastTestStatus: config.lastTestStatus || "untested",
    lastTestMessage: config.lastTestMessage || "",
    ownerId: config.ownerId,
    teamId: config.teamId,
    updatedAt: config.updatedAt
  };
}

function providerLabel(provider: string) {
  const labels: Record<string, string> = {
    openai: "OpenAI",
    anthropic: "Claude",
    gemini: "Gemini",
    deepseek: "DeepSeek",
    qwen: "通义千问",
    moonshot: "Kimi",
    zhipu: "智谱GLM",
    baidu: "百度千帆",
    volcengine: "豆包",
    mistral: "Mistral",
    groq: "Groq",
    openrouter: "OpenRouter",
    ollama: "Ollama",
    custom: "自定义模型"
  };
  return labels[provider] || provider || "AI模型";
}

function structuredConnectionResult(content: string, traceId: string) {
  const source = content.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(source) as { ok?: unknown };
    if (parsed?.ok === true) return true;
  } catch {
    // The public result below intentionally avoids echoing provider content.
  }
  throw new ModelGatewayError("invalid_response", "模型已响应，但结构化测试结果必须为 {\"ok\":true}", traceId, false);
}

export async function testAiConfig(config: AiModelConfig, gateway: ModelGateway) {
  try {
    const result = await gateway.generateText({
      config,
      prompt: "只返回 JSON：{\"ok\":true}",
      maxInputChars: 1200,
      systemPrompt: "这是模型连接测试。只返回严格 JSON，不要解释或输出 Markdown。"
    });
    structuredConnectionResult(result.content, result.traceId);
    return { ok: true, message: `${providerLabel(config.provider)} 连接测试通过`, traceId: result.traceId };
  } catch (error) {
    if (error instanceof ModelGatewayError) {
      return { ok: false, message: `AI 连接失败：${error.message}`, traceId: error.traceId, errorCode: error.code };
    }
    return { ok: false, message: "AI 连接失败，请检查 Base URL / Key / Model", traceId: "", errorCode: "provider_error" as const };
  }
}
