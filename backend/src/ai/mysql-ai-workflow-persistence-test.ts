import assert from "node:assert/strict";
import type mysql from "mysql2/promise";
import type { AiModelConfig } from "../types.js";
import type { ModelGateway, ModelGatewayRequest } from "../gateways/model-gateway.js";
import {
  AiWorkflowError,
  createAiWorkflowEngine,
  type AiWorkflowAuditEvent
} from "./ai-workflow-engine.js";
import {
  assertNoWorkflowSecrets,
  createMysqlAiWorkflowCheckpointer,
  createMysqlAiWorkflowEffectStore,
  createMysqlAiWorkflowPersistence,
  ensureMysqlAiWorkflowSchema
} from "./mysql-ai-workflow-persistence.js";

type CheckpointRecord = {
  thread_id: string; checkpoint_ns: string; checkpoint_id: string; parent_checkpoint_id: string | null;
  checkpoint_type: string; checkpoint_blob: unknown; metadata_type: string; metadata_blob: unknown;
};
type WriteRecord = {
  thread_id: string; checkpoint_ns: string; checkpoint_id: string; task_id: string; write_index: number;
  channel: string; value_type: string; value_blob: unknown;
};
type RunRecord = {
  run_id: string; workflow_trace_id: string; actor_id: string; tenant_id: string; lead_id: string;
  model_config_id: string; status: string; attempt: number; proposal_json: string | null;
  outcome: string | null; effect_reference_id: string | null; version: number;
};
type ApprovalRecord = { run_id: string; attempt: number; decision: string; actor_id: string; tenant_id: string };
type EffectRecord = { idempotency_key: string; status: string; result_json: string | null; error_code: string | null; lease_expires_at: Date | null };

function duplicateError() {
  return Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" });
}

class FakeMysqlPool {
  statements: Array<{ sql: string; params: unknown[] }> = [];
  schemaTables = new Set<string>();
  checkpoints: CheckpointRecord[] = [];
  writes: WriteRecord[] = [];
  runs = new Map<string, RunRecord>();
  approvals = new Map<string, ApprovalRecord>();
  effects = new Map<string, EffectRecord>();
  audits: unknown[][] = [];

  seedEffect(key: string, input: Partial<EffectRecord>) {
    this.effects.set(key, {
      idempotency_key: key,
      status: "executing",
      result_json: null,
      error_code: null,
      lease_expires_at: new Date(0),
      ...input
    });
  }

  async execute(sql: string, params: unknown[] = []): Promise<[unknown, unknown[]]> {
    const normalized = sql.replace(/\s+/g, " ").trim();
    this.statements.push({ sql: normalized, params: [...params] });

    const createMatch = normalized.match(/^CREATE TABLE IF NOT EXISTS ([a-z_]+)/i);
    if (createMatch) {
      this.schemaTables.add(createMatch[1]);
      return [{ affectedRows: 0 }, []];
    }

    if (normalized.startsWith("INSERT INTO ai_workflow_checkpoints")) {
      const [thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, checkpoint_type, checkpoint_blob, metadata_type, metadata_blob] = params;
      const index = this.checkpoints.findIndex((row) => row.thread_id === thread_id && row.checkpoint_ns === checkpoint_ns && row.checkpoint_id === checkpoint_id);
      const value = { thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, checkpoint_type, checkpoint_blob, metadata_type, metadata_blob } as CheckpointRecord;
      if (index >= 0) this.checkpoints[index] = value; else this.checkpoints.push(value);
      return [{ affectedRows: index >= 0 ? 2 : 1 }, []];
    }
    if (normalized.startsWith("SELECT thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id")) {
      let selected = [...this.checkpoints];
      let cursor = 0;
      if (normalized.includes("thread_id = ?")) { const value = params[cursor++]; selected = selected.filter((row) => row.thread_id === value); }
      if (normalized.includes("checkpoint_ns = ?")) { const value = params[cursor++]; selected = selected.filter((row) => row.checkpoint_ns === value); }
      if (normalized.includes("checkpoint_id = ?")) { const value = params[cursor++]; selected = selected.filter((row) => row.checkpoint_id === value); }
      if (normalized.includes("checkpoint_id < ?")) { const value = String(params[cursor++]); selected = selected.filter((row) => row.checkpoint_id < value); }
      selected.sort((a, b) => b.checkpoint_id.localeCompare(a.checkpoint_id));
      if (normalized.endsWith("LIMIT 1")) selected = selected.slice(0, 1);
      return [selected.map((row) => ({ ...row })), []];
    }
    if (normalized.startsWith("INSERT INTO ai_workflow_checkpoint_writes")) {
      const [thread_id, checkpoint_ns, checkpoint_id, task_id, write_index, channel, value_type, value_blob] = params;
      const index = this.writes.findIndex((row) => row.thread_id === thread_id && row.checkpoint_ns === checkpoint_ns && row.checkpoint_id === checkpoint_id && row.task_id === task_id && row.write_index === write_index);
      const value = { thread_id, checkpoint_ns, checkpoint_id, task_id, write_index, channel, value_type, value_blob } as WriteRecord;
      if (index < 0) this.writes.push(value);
      else if (Number(write_index) < 0) this.writes[index] = value;
      return [{ affectedRows: index < 0 ? 1 : Number(write_index) < 0 ? 2 : 0 }, []];
    }
    if (normalized.startsWith("SELECT task_id, channel, value_type, value_blob FROM ai_workflow_checkpoint_writes")) {
      const [threadId, namespace, checkpointId] = params;
      return [this.writes.filter((row) => row.thread_id === threadId && row.checkpoint_ns === namespace && row.checkpoint_id === checkpointId)
        .sort((a, b) => a.task_id.localeCompare(b.task_id) || a.write_index - b.write_index)
        .map(({ task_id, channel, value_type, value_blob }) => ({ task_id, channel, value_type, value_blob })), []];
    }
    if (normalized.startsWith("DELETE FROM ai_workflow_checkpoint_writes WHERE thread_id = ?")) {
      const before = this.writes.length; this.writes = this.writes.filter((row) => row.thread_id !== params[0]);
      return [{ affectedRows: before - this.writes.length }, []];
    }
    if (normalized.startsWith("DELETE FROM ai_workflow_checkpoints WHERE thread_id = ?")) {
      const before = this.checkpoints.length; this.checkpoints = this.checkpoints.filter((row) => row.thread_id !== params[0]);
      return [{ affectedRows: before - this.checkpoints.length }, []];
    }

    if (normalized.startsWith("INSERT INTO ai_workflow_runs")) {
      const [run_id, workflow_trace_id, actor_id, tenant_id, lead_id, model_config_id, status, attempt, proposal_json, outcome, effect_reference_id] = params;
      if (this.runs.has(String(run_id))) throw duplicateError();
      this.runs.set(String(run_id), { run_id, workflow_trace_id, actor_id, tenant_id, lead_id, model_config_id, status, attempt, proposal_json, outcome, effect_reference_id, version: 1 } as RunRecord);
      return [{ affectedRows: 1 }, []];
    }
    if (normalized.startsWith("UPDATE ai_workflow_runs SET status = ?")) {
      const [status, attempt, proposal_json, outcome, effect_reference_id, runId, actorId, tenantId] = params;
      const row = this.runs.get(String(runId));
      if (!row || row.actor_id !== actorId || row.tenant_id !== tenantId) return [{ affectedRows: 0 }, []];
      Object.assign(row, { status, attempt, proposal_json, outcome, effect_reference_id, version: row.version + 1 });
      return [{ affectedRows: 1 }, []];
    }
    if (normalized.startsWith("SELECT run_id, workflow_trace_id")) {
      const row = this.runs.get(String(params[0]));
      return [row ? [{ ...row }] : [], []];
    }

    if (normalized.startsWith("INSERT INTO ai_workflow_approvals")) {
      const [run_id, attempt, decision, actor_id, tenant_id] = params;
      const key = `${run_id}:${attempt}`;
      if (this.approvals.has(key)) throw duplicateError();
      this.approvals.set(key, { run_id, attempt, decision, actor_id, tenant_id } as ApprovalRecord);
      return [{ affectedRows: 1 }, []];
    }
    if (normalized.startsWith("SELECT decision, actor_id, tenant_id FROM ai_workflow_approvals")) {
      const row = this.approvals.get(`${params[0]}:${params[1]}`);
      return [row ? [{ decision: row.decision, actor_id: row.actor_id, tenant_id: row.tenant_id }] : [], []];
    }

    if (normalized.startsWith("INSERT INTO ai_workflow_audits")) {
      this.audits.push([...params]);
      return [{ affectedRows: 1 }, []];
    }

    if (normalized.startsWith("INSERT INTO ai_workflow_effects")) {
      const [idempotency_key, lease_expires_at] = params;
      if (this.effects.has(String(idempotency_key))) throw duplicateError();
      this.effects.set(String(idempotency_key), { idempotency_key, status: "executing", result_json: null, error_code: null, lease_expires_at } as EffectRecord);
      return [{ affectedRows: 1 }, []];
    }
    if (normalized.startsWith("SELECT status, result_json, lease_expires_at FROM ai_workflow_effects")) {
      const row = this.effects.get(String(params[0]));
      return [row ? [{ status: row.status, result_json: row.result_json, lease_expires_at: row.lease_expires_at }] : [], []];
    }
    if (normalized.includes("SET status = 'succeeded'")) {
      const [resultJson, key] = params; const row = this.effects.get(String(key));
      if (!row || row.status !== "executing") return [{ affectedRows: 0 }, []];
      Object.assign(row, { status: "succeeded", result_json: resultJson, error_code: null, lease_expires_at: null });
      return [{ affectedRows: 1 }, []];
    }
    if (normalized.includes("SET status = 'failed'")) {
      const [errorCode, key] = params; const row = this.effects.get(String(key));
      if (!row || row.status !== "executing") return [{ affectedRows: 0 }, []];
      Object.assign(row, { status: "failed", error_code: errorCode, lease_expires_at: null });
      return [{ affectedRows: 1 }, []];
    }
    if (normalized.includes("SET status = 'executing', result_json = NULL")) {
      const [lease, key, current] = params; const row = this.effects.get(String(key));
      const claimable = row && (row.status === "failed" || (row.status === "executing" && (!row.lease_expires_at || row.lease_expires_at.getTime() <= (current as Date).getTime())));
      if (!claimable || !row) return [{ affectedRows: 0 }, []];
      Object.assign(row, { status: "executing", result_json: null, error_code: null, lease_expires_at: lease });
      return [{ affectedRows: 1 }, []];
    }

    throw new Error(`FakeMysqlPool does not support SQL: ${normalized}`);
  }
}

const pool = new FakeMysqlPool();
await ensureMysqlAiWorkflowSchema(pool as unknown as mysql.Pool);
assert.deepEqual([...pool.schemaTables].sort(), [
  "ai_workflow_approvals", "ai_workflow_audits", "ai_workflow_checkpoint_writes",
  "ai_workflow_checkpoints", "ai_workflow_effects", "ai_workflow_runs"
]);

// Direct checkpointer contract: typed checkpoint, pending writes, list, cross-instance read and scoped delete.
const saverA = createMysqlAiWorkflowCheckpointer(pool as unknown as mysql.Pool);
const saverB = createMysqlAiWorkflowCheckpointer(pool as unknown as mysql.Pool);
const cp1 = { v: 4, id: "0001", ts: "2026-07-15T00:00:00.000Z", channel_values: { state: "one" }, channel_versions: { state: 1 }, versions_seen: {} };
const cfg1 = await saverA.put({ configurable: { thread_id: "manual-a" } }, cp1, { source: "input", step: -1, parents: {} }, {});
await saverA.putWrites(cfg1, [["custom", { value: 1 }]], "task-1");
await saverA.put({ configurable: { thread_id: "manual-b" } }, { ...cp1, id: "0002" }, { source: "input", step: -1, parents: {} }, {});
const tuple = await saverB.getTuple({ configurable: { thread_id: "manual-a" } });
assert.equal(tuple?.checkpoint.channel_values.state, "one");
assert.deepEqual(tuple?.pendingWrites, [["task-1", "custom", { value: 1 }]]);
const listedManual: unknown[] = [];
for await (const item of saverB.list({ configurable: { thread_id: "manual-a" } })) listedManual.push(item);
assert.equal(listedManual.length, 1);
await saverB.deleteThread("manual-a");
assert.equal(await saverA.getTuple({ configurable: { thread_id: "manual-a" } }), undefined);
assert.ok(await saverA.getTuple({ configurable: { thread_id: "manual-b" } }));

const secretApiKey = "workflow-secret-runtime-only";
const modelConfig: AiModelConfig = {
  id: "cfg-score", provider: "mock", protocol: "openai-compatible", name: "Mock", baseUrl: "https://model.example.test/v1",
  model: "mock-1", apiKey: secretApiKey, enabled: true, temperature: 0, useLeadFinder: false, useWebsiteParse: false,
  useScoring: true, useEmailDraft: false, useExam: false, ownerId: "user-1", teamId: "team-1", updatedAt: "2026-07-15T00:00:00.000Z"
};
class MockGateway implements ModelGateway {
  calls: ModelGatewayRequest[] = [];
  realOutboundCalls = 0;
  async generateText(request: ModelGatewayRequest) {
    this.calls.push(request);
    return { content: JSON.stringify({ score: 88, grade: "A", rationale: "Strong mock fit", nextAction: "Review mock proposal" }), traceId: `model-${this.calls.length}`, provider: "mock", model: "mock-1" };
  }
}
const gateway = new MockGateway();
const actor = { id: "user-1", tenantId: "team-1" };
const externalAudit: AiWorkflowAuditEvent[] = [];
const businessEffects = new Map<string, { referenceId: string }>();
let allowApply = true;
let runIndex = 0;
let traceIndex = 0;
const common = {
  modelGateway: gateway,
  resolveModelConfig: async () => modelConfig,
  authorize: async ({ action }: { action: string }) => action === "lead:read" || allowApply,
  readLead: async ({ leadId }: { leadId: string }) => ({ id: leadId, ownerId: actor.id, company: "Mock Export Ltd", country: "US", summary: "Synthetic test lead" }),
  applyProposal: async ({ idempotencyKey }: { idempotencyKey: string }) => {
    const existing = businessEffects.get(idempotencyKey);
    if (existing) return existing;
    await new Promise((resolve) => setTimeout(resolve, 20));
    const result = { referenceId: `effect-${businessEffects.size + 1}` };
    businessEffects.set(idempotencyKey, result);
    return result;
  },
  audit: async (event: AiWorkflowAuditEvent) => { externalAudit.push(event); },
  createRunId: () => `mysql-run-${++runIndex}`,
  createTraceId: () => `mysql-trace-${++traceIndex}`
};
const bundleA = createMysqlAiWorkflowPersistence(pool as unknown as mysql.Pool, { pollMs: 2, waitMs: 1000, leaseMs: 1000 });
const bundleB = createMysqlAiWorkflowPersistence(pool as unknown as mysql.Pool, { pollMs: 2, waitMs: 1000, leaseMs: 1000 });
const engineA = createAiWorkflowEngine({ ...common, ...bundleA });
const engineB = createAiWorkflowEngine({ ...common, ...bundleB });

const started = await engineA.start({ actor, leadId: "lead-cross-instance", modelConfigId: modelConfig.id });
assert.equal(started.status, "awaiting_confirmation");
assert.equal((await engineB.getSnapshot(started.runId))?.status, "awaiting_confirmation");
const completed = await engineB.resume({ runId: started.runId, actor, decision: "approve" });
assert.equal(completed.status, "completed");
assert.equal(businessEffects.size, 1);
assert.equal((await bundleA.persistence.getRun(started.runId))?.status, "completed");

await assert.rejects(
  engineB.resume({ runId: started.runId, actor: { id: "intruder", tenantId: actor.tenantId }, decision: "approve" }),
  (error: unknown) => error instanceof AiWorkflowError && error.code === "resume_forbidden"
);

// Duplicate start with the same run identity must return persisted state without a second model call.
const modelCallsBeforeReplay = gateway.calls.length;
const replayedStart = await engineA.start({ actor, leadId: "lead-cross-instance", modelConfigId: modelConfig.id, runId: started.runId });
assert.equal(replayedStart.status, "completed");
assert.equal(gateway.calls.length, modelCallsBeforeReplay);

// Two process-local engines approve concurrently; MySQL effect key keeps the business effect unique.
const concurrent = await engineA.start({ actor, leadId: "lead-concurrent", modelConfigId: modelConfig.id });
const beforeConcurrent = businessEffects.size;
const approvalResults = await Promise.allSettled([
  engineA.resume({ runId: concurrent.runId, actor, decision: "approve" }),
  engineB.resume({ runId: concurrent.runId, actor, decision: "approve" })
]);
assert.ok(approvalResults.some((result) => result.status === "fulfilled"));
assert.equal(businessEffects.size, beforeConcurrent + 1);
assert.equal((await engineA.getSnapshot(concurrent.runId))?.status, "completed");

// Conflicting human decisions at the same attempt are fail-closed.
const conflict = await engineA.start({ actor, leadId: "lead-conflict", modelConfigId: modelConfig.id });
const conflictResults = await Promise.allSettled([
  engineA.resume({ runId: conflict.runId, actor, decision: "approve" }),
  engineB.resume({ runId: conflict.runId, actor, decision: "reject" })
]);
assert.equal(conflictResults.filter((result) => result.status === "rejected" && result.reason instanceof AiWorkflowError && result.reason.code === "decision_conflict").length, 1);
assert.equal(conflictResults.filter((result) => result.status === "fulfilled").length, 1);

// Permission is checked again after process recovery and before an effect.
const permissionRun = await engineA.start({ actor, leadId: "lead-permission", modelConfigId: modelConfig.id });
allowApply = false;
await assert.rejects(engineB.resume({ runId: permissionRun.runId, actor, decision: "approve" }), (error: unknown) => error instanceof AiWorkflowError && error.code === "forbidden");
allowApply = true;

// Expired effect leases are reclaimed with exactly the same stable key; an idempotent downstream remains one logical write.
const crashKey = "ai-workflow:crash-recovery:apply";
pool.seedEffect(crashKey, { status: "executing", lease_expires_at: new Date(0) });
const crashStore = createMysqlAiWorkflowEffectStore(pool as unknown as mysql.Pool, { leaseMs: 1000, waitMs: 100, pollMs: 1 });
let crashOperationCalls = 0;
const downstream = new Map<string, { referenceId: string }>();
const recovered = await crashStore.executeOnce(crashKey, async () => {
  crashOperationCalls += 1;
  const current = downstream.get(crashKey) ?? { referenceId: "recovered-reference" };
  downstream.set(crashKey, current);
  return current;
});
assert.equal(recovered.value.referenceId, "recovered-reference");
assert.equal(downstream.size, 1);
assert.equal(crashOperationCalls, 1);

// Every persistence surface rejects secrets before SQL execution.
assert.throws(() => assertNoWorkflowSecrets({ authorization: "hidden" }), /Secret field/);
await assert.rejects(
  saverA.put({ configurable: { thread_id: "secret-thread" } }, { ...cp1, id: "secret-cp", channel_values: { apiKey: "hidden" } }, { source: "input", step: -1, parents: {} }, {}),
  /Secret field/
);
await assert.rejects(bundleA.persistence.appendAudit({
  type: "workflow.started", runId: "secret-run", traceId: "trace", step: "test", actorId: actor.id, tenantId: actor.tenantId,
  leadId: "lead", occurredAt: new Date().toISOString(), details: { value: "Bearer abcdefghijklmnop" }
}), /Secret-like value/);
await assert.rejects(createMysqlAiWorkflowEffectStore(pool as unknown as mysql.Pool).executeOnce("safe-effect-key", async () => ({ accessToken: "hidden" })), /Secret field/);

const serializedDatabase = JSON.stringify({ runs: [...pool.runs.values()], approvals: [...pool.approvals.values()], effects: [...pool.effects.values()], audits: pool.audits });
assert.equal(serializedDatabase.includes(secretApiKey), false);
assert.ok(pool.statements.every(({ sql }) => !/^DELETE FROM ai_workflow_(?:checkpoints|checkpoint_writes)\s*$/i.test(sql)));
assert.ok(pool.statements.every(({ sql }) => !/TRUNCATE|persistAll/i.test(sql)));
assert.ok(pool.statements.filter(({ sql }) => /\b(SELECT|INSERT|UPDATE|DELETE)\b/i.test(sql)).every(({ sql, params }) => !sql.includes("mysql-run-") && Array.isArray(params)));
assert.equal(gateway.realOutboundCalls, 0);

console.log(JSON.stringify({
  ok: true,
  schemaTables: pool.schemaTables.size,
  crossProcessRecovery: true,
  concurrentApprovals: approvalResults.length,
  businessEffects: businessEffects.size,
  decisionConflictsClosed: true,
  permissionRechecked: true,
  crashRecoveryStableKey: crashKey,
  secretPersistenceRejected: true,
  checkpointStatements: pool.statements.filter(({ sql }) => sql.includes("ai_workflow_checkpoint")).length,
  fullSnapshotWrites: 0,
  realOutboundCalls: gateway.realOutboundCalls
}, null, 2));
