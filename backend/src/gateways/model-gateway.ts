import { randomUUID } from "node:crypto";
import { assertPublicHttpUrl, fetchPublicUrl } from "../outbound-security.js";
import type { AiModelConfig } from "../types.js";

export type ModelGatewayErrorCode =
  | "unconfigured"
  | "authentication"
  | "timeout"
  | "rate_limited"
  | "invalid_response"
  | "provider_error"
  | "security_rejected";

export class ModelGatewayError extends Error {
  constructor(
    public readonly code: ModelGatewayErrorCode,
    message: string,
    public readonly traceId: string,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "ModelGatewayError";
  }
}

export interface ModelGatewayRequest {
  config: AiModelConfig;
  prompt: string;
  maxInputChars?: number;
  systemPrompt?: string;
}

export interface ModelGatewayResult {
  content: string;
  traceId: string;
  provider: string;
  model: string;
  usage?: Record<string, unknown>;
}

export interface ModelGateway {
  generateText(request: ModelGatewayRequest): Promise<ModelGatewayResult>;
}

type HttpRequest = (url: string, init?: RequestInit) => Promise<globalThis.Response>;
type EndpointAssertion = (url: string) => Promise<unknown>;

export interface HttpModelGatewayOptions {
  request?: HttpRequest;
  assertEndpoint?: EndpointAssertion;
  allowPrivateEndpoints?: () => boolean;
  timeoutMs?: number;
  createTraceId?: () => string;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_SYSTEM_PROMPT = "你擅长把官网公开信息整理成外贸CRM商机。输出必须可被 JSON.parse 解析。";

function safeEndpoint(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "模型接口";
  }
}

function providerMessage(data: any) {
  const message = data?.error?.message || data?.message || "";
  const type = data?.error?.type || data?.error?.code || "";
  return [message, type && `(${type})`].filter(Boolean).join(" ").slice(0, 300);
}

function statusError(status: number, data: any, traceId: string) {
  const suffix = providerMessage(data);
  if (status === 401 || status === 403) {
    return new ModelGatewayError("authentication", `模型认证失败${suffix ? `：${suffix}` : ""}`, traceId, false);
  }
  if (status === 408 || status === 504) {
    return new ModelGatewayError("timeout", `模型请求超时${suffix ? `：${suffix}` : ""}`, traceId, true);
  }
  if (status === 429) {
    return new ModelGatewayError("rate_limited", `模型服务限流${suffix ? `：${suffix}` : ""}`, traceId, true);
  }
  return new ModelGatewayError("provider_error", `模型服务返回 HTTP ${status}${suffix ? `：${suffix}` : ""}`, traceId, status >= 500);
}

async function readJsonEnvelope(response: globalThis.Response, endpoint: string, traceId: string) {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    const kind = contentType.includes("text/html") || text.trim().startsWith("<") ? "HTML" : "非 JSON";
    throw new ModelGatewayError(
      "invalid_response",
      `模型接口返回${kind}响应：${safeEndpoint(endpoint)}`,
      traceId,
      false
    );
  }
  if (!response.ok) throw statusError(response.status, data, traceId);
  if (!data || typeof data !== "object") {
    throw new ModelGatewayError("invalid_response", "模型接口返回空或非法 JSON", traceId, false);
  }
  return data;
}

function nonEmptyContent(value: unknown, traceId: string) {
  const content = typeof value === "string" ? value.trim() : "";
  if (!content) throw new ModelGatewayError("invalid_response", "模型返回内容为空", traceId, false);
  return content;
}

function abortError(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || /abort|timeout/i.test(error.message));
}

export function createHttpModelGateway(options: HttpModelGatewayOptions = {}): ModelGateway {
  const requestHttp = options.request || fetchPublicUrl;
  const assertEndpoint = options.assertEndpoint || assertPublicHttpUrl;
  const allowPrivateEndpoints = options.allowPrivateEndpoints || (() => process.env.ALLOW_PRIVATE_AI_ENDPOINTS === "true");
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const createTraceId = options.createTraceId || randomUUID;

  return {
    async generateText(request) {
      const traceId = createTraceId();
      const { config } = request;
      if (!config.baseUrl || !config.model || !config.apiKey) {
        throw new ModelGatewayError("unconfigured", "模型地址、模型名称或 API Key 未配置", traceId, false);
      }
      const endpointBase = config.baseUrl.replace(/\/+$/, "");
      if (!allowPrivateEndpoints()) {
        try {
          await assertEndpoint(endpointBase);
        } catch {
          throw new ModelGatewayError("security_rejected", "模型地址未通过公网安全校验", traceId, false);
        }
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const prompt = request.prompt.slice(0, request.maxInputChars ?? 12_000);
      const systemPrompt = request.systemPrompt || DEFAULT_SYSTEM_PROMPT;
      const protocol = config.protocol || "openai-compatible";

      try {
        if (protocol === "anthropic") {
          const endpoint = `${endpointBase}/messages`;
          const response = await requestHttp(endpoint, {
            method: "POST",
            signal: controller.signal,
            headers: {
              "x-api-key": config.apiKey,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json"
            },
            body: JSON.stringify({
              model: config.model,
              max_tokens: 800,
              temperature: config.temperature ?? 0.1,
              system: systemPrompt,
              messages: [{ role: "user", content: prompt }]
            })
          });
          const data = await readJsonEnvelope(response, endpoint, traceId);
          return {
            content: nonEmptyContent(data.content?.map((item: any) => item?.text || "").join("\n"), traceId),
            traceId,
            provider: config.provider,
            model: config.model,
            usage: data.usage
          };
        }

        if (protocol === "gemini") {
          const endpoint = `${endpointBase}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
          const response = await requestHttp(endpoint, {
            method: "POST",
            signal: controller.signal,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              generationConfig: { temperature: config.temperature ?? 0.1 },
              contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n${prompt}` }] }]
            })
          });
          const data = await readJsonEnvelope(response, endpoint, traceId);
          return {
            content: nonEmptyContent(data.candidates?.[0]?.content?.parts?.map((item: any) => item?.text || "").join("\n"), traceId),
            traceId,
            provider: config.provider,
            model: config.model,
            usage: data.usageMetadata
          };
        }

        const endpoint = `${endpointBase}/chat/completions`;
        const response = await requestHttp(endpoint, {
          method: "POST",
          signal: controller.signal,
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            model: config.model,
            temperature: config.temperature ?? 0.1,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" }
          })
        });
        const data = await readJsonEnvelope(response, endpoint, traceId);
        return {
          content: nonEmptyContent(data.choices?.[0]?.message?.content, traceId),
          traceId,
          provider: config.provider,
          model: config.model,
          usage: data.usage
        };
      } catch (error) {
        if (error instanceof ModelGatewayError) {
          const redacted = error.message
            .replaceAll(config.apiKey, "[REDACTED]")
            .replaceAll(encodeURIComponent(config.apiKey), "[REDACTED]");
          if (redacted !== error.message) {
            throw new ModelGatewayError(error.code, redacted, error.traceId, error.retryable);
          }
          throw error;
        }
        if (abortError(error)) {
          throw new ModelGatewayError("timeout", "模型请求超时", traceId, true);
        }
        throw new ModelGatewayError("provider_error", "模型服务连接失败", traceId, true);
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

export const httpModelGateway = createHttpModelGateway();
