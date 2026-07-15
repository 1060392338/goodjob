import assert from "node:assert/strict";
import {
  InMemoryLeadIngestionCheckpointStore,
  LeadIngestionPipeline,
  LeadIngestionPipelineError,
  normalizeLeadRecord,
  type LeadIngestionConnector,
  type LeadIngestionSink,
  type RawLeadIngestionRecord
} from "./lead-ingestion-pipeline.js";
import { createCrmLeadIngestionSink } from "./lead-ingestion-sink.js";

const context = {
  jobId: "job-eu-001",
  ownerId: "u_sales_shirley",
  teamId: "europe",
  sourceType: "outbound" as const,
  sourceChannel: "provider-demo",
  sourceCampaign: "lighting-eu"
};

const raw = (externalId: string, company: string): RawLeadIngestionRecord => ({
  externalId,
  sourceUrl: `HTTPS://Example.COM/company/${externalId}/?utm_source=test`,
  occurredAt: "2026-07-15T10:00:00.000Z",
  fields: {
    company,
    website: "HTTPS://Example.COM/",
    country: " Sweden ",
    contact: "  Emma   Svensson ",
    email: " SALES@EXAMPLE.COM ",
    phone: "+46 (0)70 123 45 67",
    business: " LED   industrial lights "
  },
  payload: { externalId, source: "mock" }
});

const normalized = normalizeLeadRecord(raw("ext-1", "  Nordic   Tools AB "), {
  provider: "demo-provider",
  sourceKind: "api",
  transformationVersion: "lead-normalizer/v1"
});
assert.equal(normalized.company, "Nordic Tools AB");
assert.equal(normalized.email, "sales@example.com");
assert.equal(normalized.website, "https://example.com/");
assert.equal(normalized.sourceUrl, "https://example.com/company/ext-1");
assert.equal(normalized.phone, "+460701234567");
assert.equal(normalized.evidence.provider, "demo-provider");
assert.equal(normalized.evidence.transformationVersion, "lead-normalizer/v1");
assert.match(normalized.recordKey, /^leadrec_[0-9a-f]{32}$/);
assert.equal(
  normalized.recordKey,
  normalizeLeadRecord(raw("ext-1", "Different display name"), {
    provider: "demo-provider",
    sourceKind: "api",
    transformationVersion: "lead-normalizer/v1"
  }).recordKey
);

let connectorCalls = 0;
const connector: LeadIngestionConnector = {
  id: "demo-provider",
  sourceKind: "api",
  async fetchPage(request) {
    connectorCalls += 1;
    assert.equal(request.cursor, undefined);
    return {
      records: [raw("ext-1", "Nordic Tools AB"), raw("ext-2", "Baltic Works OY")],
      calls: 1,
      exhausted: true,
      nextCheckpoint: { page: 1 }
    };
  }
};

let mappedIntake: Record<string, unknown> | undefined;
const crmSink = createCrmLeadIngestionSink({
  user: {
    id: context.ownerId,
    teamId: context.teamId,
    name: "Shirley",
    email: "shirley@example.com",
    role: "sales",
    avatar: "",
    authVersion: 1
  },
  async persistLead(_user, input) {
    mappedIntake = input as unknown as Record<string, unknown>;
    return { lead: { id: "lead-crm-1" }, duplicate: false };
  }
});
const crmSinkResult = await crmSink.ingest(normalized, context);
assert.equal(crmSinkResult.status, "created");
assert.equal(mappedIntake?.externalId, normalized.recordKey);
assert.equal(mappedIntake?.sourceChannel, context.sourceChannel);
assert.equal(mappedIntake?.sourceCampaign, context.sourceCampaign);
assert.equal((mappedIntake?.rawPayload as { evidence?: { transformationVersion?: string } }).evidence?.transformationVersion, "lead-normalizer/v1");

const checkpointStore = new InMemoryLeadIngestionCheckpointStore();
const persisted = new Map<string, string>();
let transientFailures = 1;
let sinkCalls = 0;
const sink: LeadIngestionSink = {
  async ingest(record) {
    sinkCalls += 1;
    if (record.externalId === "ext-2" && transientFailures-- > 0) throw new Error("temporary sink failure");
    const previous = persisted.get(record.recordKey);
    persisted.set(record.recordKey, record.company);
    return { status: previous ? "duplicate" : "created", leadId: `lead-${record.externalId}` };
  }
};

const pipeline = new LeadIngestionPipeline({ now: () => "2026-07-15T12:00:00.000Z" });
const first = await pipeline.run({ context, connector, sink, checkpoints: checkpointStore });
assert.equal(first.status, "interrupted");
assert.equal(first.created, 1);
assert.equal(first.failures.length, 1);
assert.equal(first.failures[0]?.externalId, "ext-2");
assert.equal(persisted.size, 1);

const savedAfterFailure = await checkpointStore.load(context.jobId);
assert.equal(savedAfterFailure?.cursor, undefined);
assert.equal(savedAfterFailure?.completedRecordKeys.length, 1);
assert.equal(savedAfterFailure?.exhausted, false);

const second = await pipeline.run({ context, connector, sink, checkpoints: checkpointStore });
assert.equal(second.status, "completed");
assert.equal(second.created, 1);
assert.equal(second.skipped, 1);
assert.equal(persisted.size, 2);
assert.equal(connectorCalls, 2);
assert.equal(sinkCalls, 3);

const third = await pipeline.run({ context, connector, sink, checkpoints: checkpointStore });
assert.equal(third.status, "completed");
assert.equal(third.resumedFromCompletedCheckpoint, true);
assert.equal(connectorCalls, 2);
assert.equal(sinkCalls, 3);

const secretStore = new InMemoryLeadIngestionCheckpointStore();
const secretConnector: LeadIngestionConnector = {
  id: "secret-provider",
  sourceKind: "api",
  async fetchPage() {
    return {
      records: [{ ...raw("secret-1", "Secret Corp"), payload: { apiKey: "must-not-persist" } }],
      calls: 1,
      exhausted: true
    };
  }
};
await assert.rejects(
  pipeline.run({ context: { ...context, jobId: "secret-job" }, connector: secretConnector, sink, checkpoints: secretStore }),
  (error: unknown) => error instanceof LeadIngestionPipelineError && error.code === "secret_rejected"
);
assert.equal(await secretStore.load("secret-job"), undefined);

await checkpointStore.save({
  ...(savedAfterFailure!),
  jobId: "foreign-job",
  contextKey: "wrong-context"
});
await assert.rejects(
  pipeline.run({ context: { ...context, jobId: "foreign-job" }, connector, sink, checkpoints: checkpointStore }),
  (error: unknown) => error instanceof LeadIngestionPipelineError && error.code === "checkpoint_context_mismatch"
);

console.log(JSON.stringify({
  ok: true,
  normalizedFields: 7,
  connectorCalls,
  sinkCalls,
  persisted: persisted.size,
  resumedAfterFailure: true,
  duplicateWrites: 0,
  secretRejected: true,
  realOutboundCalls: 0
}, null, 2));
