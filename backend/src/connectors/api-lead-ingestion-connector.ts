import { createHash } from "node:crypto";
import type {
  LeadIngestionConnector,
  LeadIngestionPage,
  LeadIngestionPageRequest,
  RawLeadIngestionFields,
  RawLeadIngestionRecord
} from "../domain/leads/lead-ingestion-pipeline.js";

export type ApiLeadProviderErrorCode =
  | "authentication"
  | "permission_denied"
  | "invalid_request"
  | "rate_limited"
  | "quota_exhausted"
  | "timeout"
  | "transient"
  | "invalid_response";

export type ApiLeadConnectorErrorCode =
  | ApiLeadProviderErrorCode
  | "request_budget_exhausted"
  | "secret_rejected"
  | "checkpoint_context_mismatch"
  | "invalid_configuration";

export class ApiLeadProviderError extends Error {
  readonly retryAfterMs?: number;

  constructor(
    public readonly code: ApiLeadProviderErrorCode,
    message: string,
    options: { retryAfterMs?: number } = {}
  ) {
    super(message);
    this.name = "ApiLeadProviderError";
    this.retryAfterMs = options.retryAfterMs;
  }
}

const SAFE_ERROR_MESSAGES: Record<ApiLeadConnectorErrorCode, string> = {
  authentication: "Third-party API authentication failed",
  permission_denied: "Third-party API permission denied",
  invalid_request: "Third-party API request was rejected",
  rate_limited: "Third-party API rate limit reached",
  quota_exhausted: "Third-party API quota exhausted",
  request_budget_exhausted: "Third-party API local request budget exhausted",
  timeout: "Third-party API request timed out",
  transient: "Third-party API temporarily unavailable",
  invalid_response: "Third-party API returned an invalid response",
  secret_rejected: "Third-party API data contains a secret-like field",
  checkpoint_context_mismatch: "Third-party API checkpoint context mismatch",
  invalid_configuration: "Third-party API connector configuration is invalid"
};

export class ApiLeadConnectorError extends Error {
  constructor(public readonly code: ApiLeadConnectorErrorCode) {
    super(SAFE_ERROR_MESSAGES[code]);
    this.name = "ApiLeadConnectorError";
  }
}

export interface ApiLeadProviderDescriptor {
  id: string;
  version: string;
  configSchemaVersion: string;
  capabilities: {
    pagination: "cursor" | "page" | "none";
    retryAfter: boolean;
    quota: boolean;
  };
}

export interface ApiLeadProviderRequest {
  credentialHandle: string;
  config: Record<string, unknown>;
  cursor?: string;
  pageSize: number;
  attempt: number;
  timeoutMs: number;
}

export interface ApiLeadProviderQuota {
  remaining: number;
  resetAt?: string;
}

export interface ApiLeadProviderResponse {
  records: unknown[];
  nextCursor?: string;
  hasMore: boolean;
  requestId: string;
  quota?: ApiLeadProviderQuota;
}

export interface ApiLeadProviderPlugin {
  readonly descriptor: ApiLeadProviderDescriptor;
  validateConfig(config: Record<string, unknown>): void;
  fetchPage(request: ApiLeadProviderRequest): Promise<ApiLeadProviderResponse>;
}

export interface ApiLeadMappedRecord {
  externalId?: string;
  sourceUrl?: string;
  occurredAt?: string;
  fields: RawLeadIngestionFields;
}

export interface ApiLeadMapper {
  readonly version: string;
  map(raw: unknown): ApiLeadMappedRecord;
}

export interface ApiLeadRequestBudget {
  consume(key: string, limit: number, windowMs: number, nowMs: number): boolean;
}

interface BudgetWindow {
  startedAt: number;
  used: number;
}

export class InMemoryApiLeadRequestBudget implements ApiLeadRequestBudget {
  private readonly windows = new Map<string, BudgetWindow>();

  consume(key: string, limit: number, windowMs: number, nowMs: number) {
    const current = this.windows.get(key);
    if (!current || nowMs - current.startedAt >= windowMs || nowMs < current.startedAt) {
      this.windows.set(key, { startedAt: nowMs, used: 1 });
      return true;
    }
    if (current.used >= limit) return false;
    current.used += 1;
    return true;
  }
}

export class ApiLeadProviderRegistry {
  private readonly providers = new Map<string, ApiLeadProviderPlugin>();

  register(provider: ApiLeadProviderPlugin) {
    validateDescriptor(provider.descriptor);
    const key = providerKey(provider.descriptor.id, provider.descriptor.version);
    if (this.providers.has(key)) throw new Error(`Duplicate API lead provider: ${key}`);
    this.providers.set(key, provider);
  }

  resolve(id: string, version: string) {
    const provider = this.providers.get(providerKey(id, version));
    if (!provider) throw new Error(`API lead provider is not registered: ${id}@${version}`);
    return provider;
  }
}

interface ApiLeadCheckpoint extends Record<string, unknown> {
  version: 1;
  connectorId: string;
  tenantDigest: string;
  providerId: string;
  providerVersion: string;
  configDigest: string;
  mapperVersion: string;
  providerCursor?: string;
  cursorToken?: string;
}

export interface ApiLeadIngestionConnectorOptions {
  id: string;
  tenantId: string;
  provider: ApiLeadProviderPlugin;
  providerConfig: Record<string, unknown>;
  credentialHandle: string;
  mapper: ApiLeadMapper;
  requestBudget: ApiLeadRequestBudget;
  maxRequestsPerWindow: number;
  windowMs: number;
  maxRetries: number;
  baseBackoffMs: number;
  maxBackoffMs: number;
  timeoutMs: number;
  pageSize: number;
  sleeper?: (delayMs: number) => Promise<void>;
  now?: () => string;
}

const SECRET_KEY = /(^|_)(api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret|private[_-]?key)($|_)/i;
const SAFE_IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const CREDENTIAL_HANDLE = /^(vault|secret|gjsec-ref):\/\/[a-z0-9][a-z0-9._~/-]{1,255}$/i;

function providerKey(id: string, version: string) {
  return `${id}@${version}`;
}

function compact(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function digest(value: unknown) {
  return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`);
  return `{${entries.join(",")}}`;
}

function containsSecretLikeKey(value: unknown, seen = new WeakSet<object>()): boolean {
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((entry) => containsSecretLikeKey(entry, seen));
  return Object.entries(value as Record<string, unknown>).some(([key, entry]) =>
    SECRET_KEY.test(key.replace(/([a-z])([A-Z])/g, "$1_$2")) || containsSecretLikeKey(entry, seen)
  );
}

function validateDescriptor(descriptor: ApiLeadProviderDescriptor) {
  if (!SAFE_IDENTIFIER.test(compact(descriptor.id))) throw new Error("Invalid API lead provider id");
  if (!compact(descriptor.version) || !compact(descriptor.configSchemaVersion)) {
    throw new Error("Invalid API lead provider version metadata");
  }
  if (!descriptor.capabilities || !["cursor", "page", "none"].includes(descriptor.capabilities.pagination)) {
    throw new Error("Invalid API lead provider capabilities");
  }
}

function positiveInteger(value: number, name: string) {
  if (!Number.isInteger(value) || value <= 0) throw new ApiLeadConnectorError("invalid_configuration");
  return value;
}

function nonNegativeInteger(value: number) {
  if (!Number.isInteger(value) || value < 0) throw new ApiLeadConnectorError("invalid_configuration");
  return value;
}

function validateMappedRecord(value: ApiLeadMappedRecord): ApiLeadMappedRecord {
  if (!value || typeof value !== "object" || !value.fields || typeof value.fields !== "object") {
    throw new ApiLeadConnectorError("invalid_response");
  }
  if (!compact(value.fields.company)) throw new ApiLeadConnectorError("invalid_response");
  return value;
}

function validateProviderResponse(response: ApiLeadProviderResponse) {
  if (!response || typeof response !== "object") throw new ApiLeadConnectorError("invalid_response");
  if (!Array.isArray(response.records) || typeof response.hasMore !== "boolean" || !compact(response.requestId)) {
    throw new ApiLeadConnectorError("invalid_response");
  }
  if (response.hasMore && !compact(response.nextCursor)) throw new ApiLeadConnectorError("invalid_response");
  if (!response.hasMore && response.nextCursor !== undefined && !compact(response.nextCursor)) {
    throw new ApiLeadConnectorError("invalid_response");
  }
  if (response.quota) {
    if (!Number.isFinite(response.quota.remaining) || response.quota.remaining < 0) {
      throw new ApiLeadConnectorError("invalid_response");
    }
    if (response.quota.resetAt && !Number.isFinite(Date.parse(response.quota.resetAt))) {
      throw new ApiLeadConnectorError("invalid_response");
    }
  }
}

function asCheckpoint(value: Record<string, unknown> | undefined) {
  return value as ApiLeadCheckpoint | undefined;
}

export class ApiLeadIngestionConnector implements LeadIngestionConnector {
  readonly sourceKind = "api" as const;
  readonly id: string;

  private readonly tenantDigest: string;
  private readonly provider: ApiLeadProviderPlugin;
  private readonly providerConfig: Record<string, unknown>;
  private readonly credentialHandle: string;
  private readonly mapper: ApiLeadMapper;
  private readonly requestBudget: ApiLeadRequestBudget;
  private readonly maxRequestsPerWindow: number;
  private readonly windowMs: number;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly timeoutMs: number;
  private readonly pageSize: number;
  private readonly sleeper: (delayMs: number) => Promise<void>;
  private readonly now: () => string;
  private readonly configDigest: string;
  private readonly budgetKey: string;

  constructor(options: ApiLeadIngestionConnectorOptions) {
    this.id = compact(options.id);
    if (!SAFE_IDENTIFIER.test(this.id) || !compact(options.tenantId)) {
      throw new ApiLeadConnectorError("invalid_configuration");
    }
    validateDescriptor(options.provider.descriptor);
    if (!CREDENTIAL_HANDLE.test(options.credentialHandle) || /[?#@]/.test(options.credentialHandle)) {
      throw new Error("Invalid credential handle; expected a controlled 凭证引用");
    }
    if (containsSecretLikeKey(options.providerConfig)) {
      throw new ApiLeadConnectorError("invalid_configuration");
    }
    if (!compact(options.mapper.version)) throw new ApiLeadConnectorError("invalid_configuration");

    this.providerConfig = structuredClone(options.providerConfig);
    try {
      options.provider.validateConfig(structuredClone(this.providerConfig));
    } catch {
      throw new ApiLeadConnectorError("invalid_configuration");
    }

    this.provider = options.provider;
    this.credentialHandle = options.credentialHandle;
    this.mapper = options.mapper;
    this.requestBudget = options.requestBudget;
    this.maxRequestsPerWindow = positiveInteger(options.maxRequestsPerWindow, "maxRequestsPerWindow");
    this.windowMs = positiveInteger(options.windowMs, "windowMs");
    this.maxRetries = nonNegativeInteger(options.maxRetries);
    this.baseBackoffMs = positiveInteger(options.baseBackoffMs, "baseBackoffMs");
    this.maxBackoffMs = positiveInteger(options.maxBackoffMs, "maxBackoffMs");
    this.timeoutMs = positiveInteger(options.timeoutMs, "timeoutMs");
    this.pageSize = positiveInteger(options.pageSize, "pageSize");
    if (this.baseBackoffMs > this.maxBackoffMs) throw new ApiLeadConnectorError("invalid_configuration");
    this.sleeper = options.sleeper || (async (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
    this.now = options.now || (() => new Date().toISOString());
    this.tenantDigest = digest(options.tenantId);
    this.configDigest = digest({ schema: options.provider.descriptor.configSchemaVersion, config: this.providerConfig });
    this.budgetKey = digest([options.tenantId, this.id, options.provider.descriptor.id, options.provider.descriptor.version]);
  }

  async fetchPage(request: LeadIngestionPageRequest): Promise<LeadIngestionPage> {
    const checkpoint = asCheckpoint(request.checkpoint);
    const providerCursor = this.validateCheckpoint(request.cursor, checkpoint);
    let calls = 0;
    let response: ApiLeadProviderResponse | undefined;

    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt += 1) {
      const nowMs = Date.parse(this.now());
      if (!Number.isFinite(nowMs) || !this.requestBudget.consume(this.budgetKey, this.maxRequestsPerWindow, this.windowMs, nowMs)) {
        throw new ApiLeadConnectorError("request_budget_exhausted");
      }
      calls += 1;
      try {
        response = await this.callProvider({
          credentialHandle: this.credentialHandle,
          config: structuredClone(this.providerConfig),
          cursor: providerCursor,
          pageSize: this.pageSize,
          attempt,
          timeoutMs: this.timeoutMs
        });
        validateProviderResponse(response);
        break;
      } catch (error) {
        if (error instanceof ApiLeadConnectorError) throw error;
        const providerError = error instanceof ApiLeadProviderError
          ? error
          : new ApiLeadProviderError("transient", "Provider plugin failed");
        const retryDelay = this.retryDelay(providerError, attempt);
        if (retryDelay === undefined || attempt > this.maxRetries) {
          throw new ApiLeadConnectorError(providerError.code);
        }
        await this.sleeper(retryDelay);
      }
    }

    if (!response) throw new ApiLeadConnectorError("transient");
    const records = response.records.map((raw, recordIndex): RawLeadIngestionRecord => {
      if (containsSecretLikeKey(raw)) throw new ApiLeadConnectorError("secret_rejected");
      let mapped: ApiLeadMappedRecord;
      try {
        mapped = validateMappedRecord(this.mapper.map(structuredClone(raw)));
      } catch (error) {
        if (error instanceof ApiLeadConnectorError) throw error;
        throw new ApiLeadConnectorError("invalid_response");
      }
      return {
        externalId: mapped.externalId,
        sourceUrl: mapped.sourceUrl,
        occurredAt: mapped.occurredAt,
        fields: structuredClone(mapped.fields),
        payload: {
          apiLineage: {
            providerId: this.provider.descriptor.id,
            providerVersion: this.provider.descriptor.version,
            requestId: response!.requestId,
            mapperVersion: this.mapper.version,
            recordIndex,
            quotaRemaining: response!.quota?.remaining,
            quotaResetAt: response!.quota?.resetAt,
            fetchedAt: this.now(),
            providerCursorDigest: digest(providerCursor || "first-page")
          }
        }
      };
    });

    const nextCheckpoint = this.createCheckpoint(response.nextCursor);
    return {
      records,
      calls,
      exhausted: !response.hasMore,
      nextCursor: response.hasMore ? nextCheckpoint.cursorToken : undefined,
      nextCheckpoint
    };
  }

  private validateCheckpoint(cursor: string | undefined, checkpoint: ApiLeadCheckpoint | undefined) {
    if (!checkpoint) {
      if (cursor) throw new ApiLeadConnectorError("checkpoint_context_mismatch");
      return undefined;
    }
    const expected: Array<[unknown, unknown]> = [
      [checkpoint.version, 1],
      [checkpoint.connectorId, this.id],
      [checkpoint.tenantDigest, this.tenantDigest],
      [checkpoint.providerId, this.provider.descriptor.id],
      [checkpoint.providerVersion, this.provider.descriptor.version],
      [checkpoint.configDigest, this.configDigest],
      [checkpoint.mapperVersion, this.mapper.version]
    ];
    if (expected.some(([actual, wanted]) => actual !== wanted)) {
      throw new ApiLeadConnectorError("checkpoint_context_mismatch");
    }
    const expectedToken = this.cursorToken(checkpoint.providerCursor);
    if (!cursor || cursor !== checkpoint.cursorToken || cursor !== expectedToken) {
      throw new ApiLeadConnectorError("checkpoint_context_mismatch");
    }
    return checkpoint.providerCursor;
  }

  private createCheckpoint(providerCursor: string | undefined): ApiLeadCheckpoint {
    return {
      version: 1,
      connectorId: this.id,
      tenantDigest: this.tenantDigest,
      providerId: this.provider.descriptor.id,
      providerVersion: this.provider.descriptor.version,
      configDigest: this.configDigest,
      mapperVersion: this.mapper.version,
      providerCursor,
      cursorToken: this.cursorToken(providerCursor)
    };
  }

  private cursorToken(providerCursor: string | undefined) {
    return `api-v1:${digest([
      this.id,
      this.tenantDigest,
      this.provider.descriptor.id,
      this.provider.descriptor.version,
      this.configDigest,
      this.mapper.version,
      providerCursor || "exhausted"
    ])}`;
  }

  private retryDelay(error: ApiLeadProviderError, attempt: number) {
    if (error.code === "rate_limited") {
      if (!Number.isFinite(error.retryAfterMs) || (error.retryAfterMs ?? -1) < 0) return undefined;
      return Math.min(error.retryAfterMs!, this.maxBackoffMs);
    }
    if (error.code !== "timeout" && error.code !== "transient") return undefined;
    return Math.min(this.baseBackoffMs * (2 ** (attempt - 1)), this.maxBackoffMs);
  }

  private async callProvider(request: ApiLeadProviderRequest) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.provider.fetchPage(request),
        new Promise<ApiLeadProviderResponse>((_, reject) => {
          timer = setTimeout(() => reject(new ApiLeadProviderError("timeout", "Provider request timed out")), this.timeoutMs);
          timer.unref?.();
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}