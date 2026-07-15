import { randomUUID } from "node:crypto";
import { LEAD_PROVIDERS, providerMeta, type LeadProvider, type LeadQuery, type ProviderCredential, type RawLead } from "../lead-providers.js";
import { assertPublicHttpUrl } from "../outbound-security.js";

export type LeadSourceConnectorErrorCode =
  | "unconfigured"
  | "authentication"
  | "timeout"
  | "rate_limited"
  | "invalid_response"
  | "provider_error"
  | "security_rejected";

export class LeadSourceConnectorError extends Error {
  constructor(
    public readonly code: LeadSourceConnectorErrorCode,
    message: string,
    public readonly traceId: string,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "LeadSourceConnectorError";
  }
}

export type LeadSourceDescriptor = ReturnType<typeof providerMeta>;

export interface LeadSourceConnectionRequest {
  provider: string;
  credential: ProviderCredential;
}

export interface LeadSourceConnectionResult {
  ok: true;
  message: string;
  usage?: string;
  provider: string;
  traceId: string;
}

export interface LeadSourcePageRequest {
  provider: string;
  credential: ProviderCredential;
  query: LeadQuery;
  cursor?: string;
  checkpoint?: Record<string, unknown>;
}

export interface LeadSourcePageResult {
  leads: RawLead[];
  calls: number;
  usage?: string;
  provider: string;
  traceId: string;
  nextCursor?: string;
  nextCheckpoint?: Record<string, unknown>;
  exhausted: boolean;
}

export interface LeadSourceConnector {
  listProviders(): LeadSourceDescriptor[];
  findProvider(provider: string): LeadSourceDescriptor | undefined;
  testConnection(request: LeadSourceConnectionRequest): Promise<LeadSourceConnectionResult>;
  searchPage(request: LeadSourcePageRequest): Promise<LeadSourcePageResult>;
}

type EndpointAssertion = (url: string) => Promise<unknown>;

export interface LeadSourceConnectorOptions {
  providers?: LeadProvider[];
  assertEndpoint?: EndpointAssertion;
  createTraceId?: () => string;
}

function sanitizeMessage(message: string, credential: ProviderCredential) {
  let safe = message;
  const secrets = [credential.apiKey, credential.apiKey ? encodeURIComponent(credential.apiKey) : ""].filter(Boolean);
  for (const secret of secrets) safe = safe.split(secret).join("[REDACTED]");
  return safe
    .replace(/(authorization\s*[:=]\s*)(?:bearer\s+)?[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:api[_-]?key|apikey|key|token|access_token)=)[^&\s]+/gi, "$1[REDACTED]")
    .slice(0, 300);
}

function errorMessage(error: unknown, credential: ProviderCredential) {
  return sanitizeMessage(error instanceof Error ? error.message : "未知错误", credential);
}

function classifyFailure(message: string): { code: LeadSourceConnectorErrorCode; retryable: boolean } {
  if (/401|403|unauthori[sz]ed|forbidden|invalid.{0,12}(?:key|token)|api key.{0,12}(?:无效|错误)|认证|鉴权/i.test(message)) {
    return { code: "authentication", retryable: false };
  }
  if (/408|504|abort|timeout|timed out|超时/i.test(message)) {
    return { code: "timeout", retryable: true };
  }
  if (/429|rate.?limit|too many requests|限流|额度耗尽|quota exceeded/i.test(message)) {
    return { code: "rate_limited", retryable: true };
  }
  return { code: "provider_error", retryable: /5\d\d|temporar|稍后|暂时/i.test(message) };
}

function requireProvider(providers: LeadProvider[], id: string, traceId: string) {
  const provider = providers.find((item) => item.id === id);
  if (!provider) throw new LeadSourceConnectorError("unconfigured", "未知数据源", traceId, false);
  return provider;
}

function validateCredential(provider: LeadProvider, credential: ProviderCredential, traceId: string) {
  if (provider.requiresKey && !credential.apiKey) {
    throw new LeadSourceConnectorError("unconfigured", "请先保存该数据源的 API Key，再测试连接", traceId, false);
  }
}

function rethrowConnectorFailure(error: unknown, credential: ProviderCredential, traceId: string): never {
  if (error instanceof LeadSourceConnectorError) throw error;
  const message = errorMessage(error, credential);
  const classified = classifyFailure(message);
  throw new LeadSourceConnectorError(classified.code, `连接异常：${message}`, traceId, classified.retryable);
}

export function createLeadSourceConnector(options: LeadSourceConnectorOptions = {}): LeadSourceConnector {
  const providers = options.providers || LEAD_PROVIDERS;
  const assertEndpoint = options.assertEndpoint || assertPublicHttpUrl;
  const createTraceId = options.createTraceId || randomUUID;

  async function assertCredentialEndpoint(credential: ProviderCredential, traceId: string) {
    if (!credential.baseUrl) return;
    try {
      await assertEndpoint(credential.baseUrl);
    } catch {
      throw new LeadSourceConnectorError("security_rejected", "数据源地址被安全策略拒绝", traceId, false);
    }
  }

  return {
    listProviders() {
      return providers.map((provider) => providerMeta(provider));
    },

    findProvider(provider) {
      const match = providers.find((item) => item.id === provider);
      return match ? providerMeta(match) : undefined;
    },

    async testConnection(request) {
      const traceId = createTraceId();
      const provider = requireProvider(providers, request.provider, traceId);
      validateCredential(provider, request.credential, traceId);
      await assertCredentialEndpoint(request.credential, traceId);
      try {
        const result = await provider.test(request.credential);
        if (!result || typeof result.ok !== "boolean" || typeof result.message !== "string") {
          throw new LeadSourceConnectorError("invalid_response", "数据源连接测试返回非法结果", traceId, false);
        }
        const message = sanitizeMessage(result.message, request.credential);
        if (!result.ok) {
          const classified = classifyFailure(message);
          throw new LeadSourceConnectorError(classified.code, message || "数据源连接测试失败", traceId, classified.retryable);
        }
        return {
          ok: true,
          message,
          usage: result.usage ? sanitizeMessage(result.usage, request.credential) : undefined,
          provider: provider.id,
          traceId
        };
      } catch (error) {
        rethrowConnectorFailure(error, request.credential, traceId);
      }
    },

    async searchPage(request) {
      const traceId = createTraceId();
      const provider = requireProvider(providers, request.provider, traceId);
      validateCredential(provider, request.credential, traceId);
      await assertCredentialEndpoint(request.credential, traceId);
      if (request.cursor || request.checkpoint) {
        throw new LeadSourceConnectorError("provider_error", "该数据源尚未实现分页或检查点恢复", traceId, false);
      }
      try {
        const result = await provider.search(request.query, request.credential);
        if (!result || !Array.isArray(result.leads) || !Number.isFinite(result.calls)) {
          throw new LeadSourceConnectorError("invalid_response", "数据源搜索返回非法结果", traceId, false);
        }
        return {
          leads: result.leads,
          calls: result.calls,
          usage: result.usage ? sanitizeMessage(result.usage, request.credential) : undefined,
          provider: provider.id,
          traceId,
          exhausted: true
        };
      } catch (error) {
        rethrowConnectorFailure(error, request.credential, traceId);
      }
    }
  };
}

export const leadSourceConnector = createLeadSourceConnector();
