import assert from "node:assert/strict";
import {
  ApiLeadConnectorError,
  ApiLeadIngestionConnector,
  ApiLeadProviderError,
  ApiLeadProviderRegistry,
  InMemoryApiLeadRequestBudget,
  type ApiLeadMapper,
  type ApiLeadProviderPlugin,
  type ApiLeadProviderRequest,
  type ApiLeadProviderResponse
} from "./api-lead-ingestion-connector.js";
import {
  InMemoryLeadIngestionCheckpointStore,
  LeadIngestionPipeline,
  type LeadIngestionContext,
  type LeadIngestionSink
} from "../domain/leads/lead-ingestion-pipeline.js";

const nowValue = "2026-07-15T16:00:00.000Z";
const credentialHandle = "vault://lead-sources/fixture-buyers";
const providerDescriptor = {
  id: "fixture-buyers-api",
  version: "2026-07-15",
  configSchemaVersion: "fixture-buyers/v1",
  capabilities: { pagination: "cursor" as const, retryAfter: true, quota: true }
};

type Handler = (request: ApiLeadProviderRequest) => Promise<ApiLeadProviderResponse>;
class MockApiProvider implements ApiLeadProviderPlugin {
  readonly descriptor = providerDescriptor;
  readonly calls: ApiLeadProviderRequest[] = [];
  handler: Handler;

  constructor(handler: Handler) { this.handler = handler; }

  validateConfig(config: Record<string, unknown>) {
    if (config.dataset !== "buyers") throw new Error("dataset must be buyers");
  }

  async fetchPage(request: ApiLeadProviderRequest) {
    this.calls.push(structuredClone(request));
    return this.handler(request);
  }
}

const mapper: ApiLeadMapper = {
  version: "fixture-buyers-mapper/v1",
  map(raw) {
    const value = raw as { id: string; company: string; domain: string; country: string; updatedAt: string };
    return {
      externalId: value.id,
      sourceUrl: `https://${value.domain}`,
      occurredAt: value.updatedAt,
      fields: { company: value.company, website: `https://${value.domain}`, country: value.country }
    };
  }
};

function page(records: unknown[], nextCursor?: string, requestId = "req-fixture"): ApiLeadProviderResponse {
  return {
    records,
    nextCursor,
    hasMore: Boolean(nextCursor),
    requestId,
    quota: { remaining: 98, resetAt: "2026-07-15T17:00:00.000Z" }
  };
}

function createHappyProvider() {
  return new MockApiProvider(async (request) => {
    if (!request.cursor) return page([{
      id: "supplier-alpha", company: "Alpha Industrial", domain: "alpha.example", country: "US", updatedAt: "2026-07-15T10:00:00.000Z"
    }], "provider-cursor-2", "req-page-1");
    assert.equal(request.cursor, "provider-cursor-2");
    return page([{
      id: "supplier-beta", company: "Beta Trading", domain: "beta.example", country: "GB", updatedAt: "2026-07-15T11:00:00.000Z"
    }], undefined, "req-page-2");
  });
}

function createConnector(provider: ApiLeadProviderPlugin, overrides: Record<string, unknown> = {}) {
  return new ApiLeadIngestionConnector({
    id: "third-party-fixture",
    tenantId: "team-1",
    provider,
    providerConfig: { dataset: "buyers", region: "global" },
    credentialHandle,
    mapper,
    requestBudget: new InMemoryApiLeadRequestBudget(),
    maxRequestsPerWindow: 50,
    windowMs: 60_000,
    maxRetries: 2,
    baseBackoffMs: 100,
    maxBackoffMs: 1000,
    timeoutMs: 1000,
    pageSize: 50,
    sleeper: async () => undefined,
    now: () => nowValue,
    ...overrides
  });
}

const registry = new ApiLeadProviderRegistry();
const registeredProvider = createHappyProvider();
registry.register(registeredProvider);
assert.equal(registry.resolve(providerDescriptor.id, providerDescriptor.version), registeredProvider);
assert.throws(() => registry.register(createHappyProvider()), /重复|duplicate/i);
assert.throws(() => registry.resolve(providerDescriptor.id, "missing-version"), /未注册|not registered/i);

const directProvider = createHappyProvider();
const directConnector = createConnector(directProvider);
const firstPage = await directConnector.fetchPage({});
assert.equal(firstPage.records.length, 1);
assert.equal(firstPage.calls, 1);
assert.equal(firstPage.exhausted, false);
assert.match(firstPage.nextCursor || "", /^api-v1:/);
assert.notEqual(firstPage.nextCursor, "provider-cursor-2");
assert.equal(firstPage.nextCheckpoint?.providerCursor, "provider-cursor-2");
assert.equal(directProvider.calls[0]?.credentialHandle, credentialHandle);
assert.equal(directProvider.calls[0]?.config.dataset, "buyers");
const firstLineage = (firstPage.records[0]?.payload as { apiLineage?: Record<string, unknown> }).apiLineage || {};
assert.equal(firstLineage.providerId, providerDescriptor.id);
assert.equal(firstLineage.providerVersion, providerDescriptor.version);
assert.equal(firstLineage.requestId, "req-page-1");
assert.equal(firstLineage.mapperVersion, mapper.version);
assert.equal(firstLineage.recordIndex, 0);
assert.equal(firstLineage.quotaRemaining, 98);
assert.equal(Object.prototype.hasOwnProperty.call(firstPage.records[0]?.payload || {}, "rawProviderRecord"), false);
assert.equal(JSON.stringify(firstPage.records[0]?.payload).includes(credentialHandle), false);
assert.equal(JSON.stringify(firstPage.nextCheckpoint).includes(credentialHandle), false);
const secondPage = await directConnector.fetchPage({ cursor: firstPage.nextCursor, checkpoint: firstPage.nextCheckpoint });
assert.equal(secondPage.records[0]?.externalId, "supplier-beta");
assert.equal(secondPage.exhausted, true);
assert.equal(secondPage.calls, 1);
const pipelineProvider = createHappyProvider();
const pipelineConnector = createConnector(pipelineProvider);
const pipeline = new LeadIngestionPipeline({ now: () => nowValue });
const pipelineContext: LeadIngestionContext = {
  jobId: "job-api-resume",
  ownerId: "owner-1",
  teamId: "team-1",
  sourceType: "inbound",
  sourceChannel: "third_party_api",
  sourceCampaign: "phase-3"
};
const pipelineCheckpoints = new InMemoryLeadIngestionCheckpointStore();
const persisted = new Map<string, string>();
let betaFailures = 1;
const pipelineSink: LeadIngestionSink = {
  async ingest(record) {
    if (record.externalId === "supplier-beta" && betaFailures-- > 0) throw new Error("temporary sink failure");
    const previous = persisted.get(record.recordKey);
    persisted.set(record.recordKey, record.company);
    return { status: previous ? "duplicate" : "created", leadId: `lead-${record.externalId}` };
  }
};
const interrupted = await pipeline.run({
  context: pipelineContext,
  connector: pipelineConnector,
  sink: pipelineSink,
  checkpoints: pipelineCheckpoints
});
assert.equal(interrupted.status, "interrupted");
assert.equal(interrupted.created, 1);
assert.equal(persisted.size, 1);
const interruptedCheckpoint = await pipelineCheckpoints.load(pipelineContext.jobId);
assert.equal(JSON.stringify(interruptedCheckpoint).includes(credentialHandle), false);
assert.equal(JSON.stringify(interruptedCheckpoint).includes("Alpha Industrial"), false);
assert.equal(JSON.stringify(interruptedCheckpoint).includes("Beta Trading"), false);
const resumed = await pipeline.run({
  context: pipelineContext,
  connector: pipelineConnector,
  sink: pipelineSink,
  checkpoints: pipelineCheckpoints
});
assert.equal(resumed.status, "completed");
assert.equal(resumed.created, 1);
assert.equal(persisted.size, 2);

const replayContext = { ...pipelineContext, jobId: "job-api-full-replay" };
const replayed = await pipeline.run({
  context: replayContext,
  connector: pipelineConnector,
  sink: pipelineSink,
  checkpoints: new InMemoryLeadIngestionCheckpointStore()
});
assert.equal(replayed.status, "completed");
assert.equal(replayed.created, 0);
assert.equal(replayed.duplicate, 2);
assert.equal(persisted.size, 2);

const retryAfterDelays: number[] = [];
let retryAfterAttempts = 0;
const retryAfterProvider = new MockApiProvider(async () => {
  retryAfterAttempts += 1;
  if (retryAfterAttempts === 1) {
    throw new ApiLeadProviderError("rate_limited", "provider said wait", { retryAfterMs: 750 });
  }
  return page([], undefined, "req-retry-after");
});
const retryAfterResult = await createConnector(retryAfterProvider, {
  sleeper: async (delayMs: number) => { retryAfterDelays.push(delayMs); }
}).fetchPage({});
assert.equal(retryAfterProvider.calls.length, 2);
assert.equal(retryAfterResult.calls, 2);
assert.deepEqual(retryAfterDelays, [750]);

const backoffDelays: number[] = [];
let transientAttempts = 0;
const transientProvider = new MockApiProvider(async () => {
  transientAttempts += 1;
  if (transientAttempts < 3) throw new ApiLeadProviderError("transient", "temporary provider failure");
  return page([], undefined, "req-transient-success");
});
const backoffResult = await createConnector(transientProvider, {
  sleeper: async (delayMs: number) => { backoffDelays.push(delayMs); }
}).fetchPage({});
assert.equal(backoffResult.calls, 3);
assert.deepEqual(backoffDelays, [100, 200]);

async function expectConnectorError(
  promise: Promise<unknown>,
  code: string,
  forbidden: string[] = [credentialHandle]
) {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof ApiLeadConnectorError, `expected ApiLeadConnectorError for ${code}`);
  assert.equal(caught.code, code);
  const serialized = `${caught.name}:${caught.message}:${JSON.stringify(caught)}`;
  for (const value of forbidden) assert.equal(serialized.includes(value), false, `${code} leaked forbidden value`);
  return caught;
}

const timeoutProvider = new MockApiProvider(async () => {
  throw new ApiLeadProviderError("timeout", "provider timeout included internal detail");
});
await expectConnectorError(createConnector(timeoutProvider, { maxRetries: 1 }).fetchPage({}), "timeout");
assert.equal(timeoutProvider.calls.length, 2);

for (const code of ["authentication", "permission_denied", "invalid_request", "quota_exhausted"] as const) {
  const provider = new MockApiProvider(async () => {
    throw new ApiLeadProviderError(code, `unsafe ${credentialHandle} provider detail`);
  });
  await expectConnectorError(createConnector(provider).fetchPage({}), code);
  assert.equal(provider.calls.length, 1, `${code} must not retry`);
}

let budgetAttempts = 0;
const budgetProvider = new MockApiProvider(async () => {
  budgetAttempts += 1;
  throw new ApiLeadProviderError("transient", "retry would exceed local budget");
});
await expectConnectorError(createConnector(budgetProvider, {
  maxRequestsPerWindow: 1,
  maxRetries: 2
}).fetchPage({}), "request_budget_exhausted");
assert.equal(budgetAttempts, 1);

const invalidResponseProvider = new MockApiProvider(async () => ({
  records: [],
  hasMore: true,
  requestId: "req-invalid-response"
}));
await expectConnectorError(createConnector(invalidResponseProvider).fetchPage({}), "invalid_response");
assert.equal(invalidResponseProvider.calls.length, 1);

const rawSecretValue = "should-never-persist";
let secretMapperCalls = 0;
const secretMapper: ApiLeadMapper = {
  version: "secret-mapper/v1",
  map(raw) {
    secretMapperCalls += 1;
    return mapper.map(raw);
  }
};
const secretRecordProvider = new MockApiProvider(async () => page([{
  id: "unsafe",
  company: "Unsafe",
  domain: "unsafe.example",
  country: "US",
  updatedAt: nowValue,
  api_key: rawSecretValue
}], undefined, "req-secret"));
await expectConnectorError(createConnector(secretRecordProvider, { mapper: secretMapper }).fetchPage({}), "secret_rejected", [credentialHandle, rawSecretValue]);
assert.equal(secretMapperCalls, 0);

assert.throws(
  () => createConnector(createHappyProvider(), { providerConfig: { dataset: "buyers", apiKey: "config-credential-material-987" } }),
  (error: unknown) => error instanceof ApiLeadConnectorError && error.code === "invalid_configuration" && !error.message.includes("config-credential-material-987")
);
assert.throws(
  () => createConnector(createHappyProvider(), { credentialHandle: "sk-live-secret" }),
  /credential handle|凭证引用/i
);

for (const field of ["providerVersion", "configDigest", "mapperVersion", "tenantDigest"] as const) {
  const provider = createHappyProvider();
  const connector = createConnector(provider);
  const initial = await connector.fetchPage({});
  const tamperedCheckpoint = structuredClone(initial.nextCheckpoint || {});
  tamperedCheckpoint[field] = `tampered-${field}`;
  await expectConnectorError(
    connector.fetchPage({ cursor: initial.nextCursor, checkpoint: tamperedCheckpoint }),
    "checkpoint_context_mismatch"
  );
  assert.equal(provider.calls.length, 1, `${field} mismatch must fail before provider call`);
}

console.log(JSON.stringify({
  ok: true,
  providerPlugins: 1,
  pages: 2,
  lineageFields: 6,
  retryAfterHonored: true,
  exponentialBackoff: true,
  requestBudgetProtected: true,
  errorClassifications: 10,
  resumedAfterFailure: true,
  duplicateWrites: 0,
  credentialLeaks: 0,
  realOutboundCalls: 0
}, null, 2));
