import type { RunnableConfig } from "@langchain/core/runnables";
import {
  BaseCheckpointSaver,
  WRITES_IDX_MAP,
  copyCheckpoint,
  getCheckpointId,
  type ChannelVersions,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointMetadata,
  type CheckpointPendingWrite,
  type CheckpointTuple,
  type PendingWrite
} from "@langchain/langgraph-checkpoint";
import type mysql from "mysql2/promise";
import type {
  AiWorkflowAuditEvent,
  AiWorkflowDecision,
  AiWorkflowEffectResult,
  AiWorkflowEffectStore,
  AiWorkflowPersistence,
  AiWorkflowSnapshot
} from "./ai-workflow-engine.js";

type SqlExecutor = Pick<mysql.Pool, "execute"> | Pick<mysql.PoolConnection, "execute">;
type ResultHeader = { affectedRows?: number };
type CheckpointRow = {
  thread_id: string;
  checkpoint_ns: string;
  checkpoint_id: string;
  parent_checkpoint_id: string | null;
  checkpoint_type: string;
  checkpoint_blob: Buffer | Uint8Array | string;
  metadata_type: string;
  metadata_blob: Buffer | Uint8Array | string;
};
type WriteRow = {
  task_id: string;
  channel: string;
  value_type: string;
  value_blob: Buffer | Uint8Array | string;
};
type RunRow = {
  run_id: string;
  workflow_trace_id: string;
  actor_id: string;
  tenant_id: string;
  lead_id: string;
  model_config_id: string;
  status: AiWorkflowSnapshot["status"];
  attempt: number;
  proposal_json: string | null;
  outcome: AiWorkflowSnapshot["outcome"];
  effect_reference_id: string | null;
};
type ApprovalRow = { decision: AiWorkflowDecision; actor_id: string; tenant_id: string };
type EffectRow = {
  status: "executing" | "succeeded" | "failed";
  result_json: string | null;
  lease_expires_at: Date | string | null;
};

const IDENTIFIER_MAX_LENGTH = 191;
const SECRET_KEYS = new Set([
  "apikey",
  "authorization",
  "cookie",
  "password",
  "smtppassword",
  "secret",
  "accesstoken",
  "refreshtoken"
]);
const SECRET_VALUE_PATTERNS = [
  /gjsec:v1:/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/i,
  /\bsk-[A-Za-z0-9_-]{16,}/
];

function assertIdentifier(name: string, value: unknown, options: { allowEmpty?: boolean } = {}): asserts value is string {
  if (typeof value !== "string" || (!options.allowEmpty && value.length === 0) || value.length > IDENTIFIER_MAX_LENGTH || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`Invalid ${name}`);
  }
}

export function assertNoWorkflowSecrets(value: unknown, path = "payload", seen = new Set<object>()): void {
  if (typeof value === "string") {
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
      throw new Error(`Secret-like value cannot be persisted at ${path}`);
    }
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (Buffer.isBuffer(value) || value instanceof Uint8Array || value instanceof Date) return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoWorkflowSecrets(entry, `${path}[${index}]`, seen));
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.replace(/[-_]/g, "").toLowerCase();
    if (SECRET_KEYS.has(normalized)) throw new Error(`Secret field cannot be persisted at ${path}.${key}`);
    assertNoWorkflowSecrets(entry, `${path}.${key}`, seen);
  }
}

function asBytes(value: Buffer | Uint8Array | string): Uint8Array {
  if (typeof value === "string") return Buffer.from(value);
  return value;
}

async function rows<T>(executor: SqlExecutor, sql: string, params: any[] = []): Promise<T[]> {
  const [result] = await executor.execute(sql, params);
  return result as T[];
}

async function execute(executor: SqlExecutor, sql: string, params: any[] = []): Promise<ResultHeader> {
  const [result] = await executor.execute(sql, params);
  return result as ResultHeader;
}

function isDuplicate(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "ER_DUP_ENTRY");
}

function snapshotFromRow(row: RunRow): AiWorkflowSnapshot {
  const proposal = row.proposal_json ? JSON.parse(row.proposal_json) : null;
  const snapshot: AiWorkflowSnapshot = {
    runId: row.run_id,
    workflowTraceId: row.workflow_trace_id,
    actorId: row.actor_id,
    tenantId: row.tenant_id,
    leadId: row.lead_id,
    modelConfigId: row.model_config_id,
    status: row.status,
    attempt: Number(row.attempt),
    proposal,
    outcome: row.outcome,
    effectReferenceId: row.effect_reference_id
  };
  assertNoWorkflowSecrets(snapshot);
  return snapshot;
}

export async function ensureMysqlAiWorkflowSchema(pool: mysql.Pool): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS ai_workflow_runs (
      run_id VARCHAR(191) PRIMARY KEY,
      workflow_trace_id VARCHAR(191) NOT NULL,
      actor_id VARCHAR(191) NOT NULL,
      tenant_id VARCHAR(191) NOT NULL,
      lead_id VARCHAR(191) NOT NULL,
      model_config_id VARCHAR(191) NOT NULL,
      status VARCHAR(32) NOT NULL,
      attempt INT NOT NULL DEFAULT 0,
      proposal_json JSON NULL,
      outcome VARCHAR(32) NULL,
      effect_reference_id VARCHAR(191) NULL,
      version BIGINT NOT NULL DEFAULT 1,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX idx_ai_workflow_runs_tenant_actor (tenant_id, actor_id),
      INDEX idx_ai_workflow_runs_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS ai_workflow_checkpoints (
      thread_id VARCHAR(191) NOT NULL,
      checkpoint_ns VARCHAR(191) NOT NULL DEFAULT '',
      checkpoint_id VARCHAR(191) NOT NULL,
      parent_checkpoint_id VARCHAR(191) NULL,
      checkpoint_type VARCHAR(64) NOT NULL,
      checkpoint_blob LONGBLOB NOT NULL,
      metadata_type VARCHAR(64) NOT NULL,
      metadata_blob LONGBLOB NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id),
      INDEX idx_ai_workflow_checkpoints_latest (thread_id, checkpoint_ns, checkpoint_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS ai_workflow_checkpoint_writes (
      thread_id VARCHAR(191) NOT NULL,
      checkpoint_ns VARCHAR(191) NOT NULL DEFAULT '',
      checkpoint_id VARCHAR(191) NOT NULL,
      task_id VARCHAR(191) NOT NULL,
      write_index INT NOT NULL,
      channel VARCHAR(191) NOT NULL,
      value_type VARCHAR(64) NOT NULL,
      value_blob LONGBLOB NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, write_index),
      INDEX idx_ai_workflow_writes_checkpoint (thread_id, checkpoint_ns, checkpoint_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS ai_workflow_approvals (
      run_id VARCHAR(191) NOT NULL,
      attempt INT NOT NULL,
      decision VARCHAR(32) NOT NULL,
      actor_id VARCHAR(191) NOT NULL,
      tenant_id VARCHAR(191) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (run_id, attempt)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS ai_workflow_effects (
      idempotency_key VARCHAR(191) PRIMARY KEY,
      status VARCHAR(32) NOT NULL,
      result_json JSON NULL,
      error_code VARCHAR(64) NULL,
      lease_expires_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX idx_ai_workflow_effects_status_lease (status, lease_expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    `CREATE TABLE IF NOT EXISTS ai_workflow_audits (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      run_id VARCHAR(191) NOT NULL,
      trace_id VARCHAR(191) NOT NULL,
      event_type VARCHAR(64) NOT NULL,
      step VARCHAR(96) NOT NULL,
      actor_id VARCHAR(191) NOT NULL,
      tenant_id VARCHAR(191) NOT NULL,
      lead_id VARCHAR(191) NOT NULL,
      occurred_at DATETIME(3) NOT NULL,
      details_json JSON NULL,
      INDEX idx_ai_workflow_audits_run (run_id, id),
      INDEX idx_ai_workflow_audits_tenant (tenant_id, occurred_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  ];
  for (const statement of statements) await pool.execute(statement);
}

class MysqlAiWorkflowCheckpointer extends BaseCheckpointSaver {
  constructor(private readonly pool: mysql.Pool) {
    super();
  }

  private configParts(config: RunnableConfig, requireCheckpoint = false) {
    const threadId = config.configurable?.thread_id;
    const checkpointNs = config.configurable?.checkpoint_ns ?? "";
    const checkpointId = getCheckpointId(config);
    assertIdentifier("thread_id", threadId);
    assertIdentifier("checkpoint_ns", checkpointNs, { allowEmpty: true });
    if (requireCheckpoint) assertIdentifier("checkpoint_id", checkpointId);
    else if (checkpointId) assertIdentifier("checkpoint_id", checkpointId);
    return { threadId, checkpointNs, checkpointId };
  }

  private async tuple(row: CheckpointRow): Promise<CheckpointTuple> {
    const checkpoint = await this.serde.loadsTyped(row.checkpoint_type, asBytes(row.checkpoint_blob)) as Checkpoint;
    const metadata = await this.serde.loadsTyped(row.metadata_type, asBytes(row.metadata_blob)) as CheckpointMetadata;
    assertNoWorkflowSecrets(checkpoint);
    assertNoWorkflowSecrets(metadata);
    const writeRows = await rows<WriteRow>(this.pool,
      `SELECT task_id, channel, value_type, value_blob
       FROM ai_workflow_checkpoint_writes
       WHERE thread_id = ? AND checkpoint_ns = ? AND checkpoint_id = ?
       ORDER BY task_id, write_index`,
      [row.thread_id, row.checkpoint_ns, row.checkpoint_id]);
    const pendingWrites: CheckpointPendingWrite[] = [];
    for (const write of writeRows) {
      const value = await this.serde.loadsTyped(write.value_type, asBytes(write.value_blob));
      assertNoWorkflowSecrets(value);
      pendingWrites.push([write.task_id, write.channel, value]);
    }
    const tuple: CheckpointTuple = {
      config: { configurable: { thread_id: row.thread_id, checkpoint_ns: row.checkpoint_ns, checkpoint_id: row.checkpoint_id } },
      checkpoint,
      metadata,
      pendingWrites
    };
    if (row.parent_checkpoint_id) {
      tuple.parentConfig = { configurable: { thread_id: row.thread_id, checkpoint_ns: row.checkpoint_ns, checkpoint_id: row.parent_checkpoint_id } };
    }
    return tuple;
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const { threadId, checkpointNs, checkpointId } = this.configParts(config);
    const params: any[] = [threadId, checkpointNs];
    let sql = `SELECT thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id,
      checkpoint_type, checkpoint_blob, metadata_type, metadata_blob
      FROM ai_workflow_checkpoints WHERE thread_id = ? AND checkpoint_ns = ?`;
    if (checkpointId) {
      sql += " AND checkpoint_id = ?";
      params.push(checkpointId);
    }
    sql += " ORDER BY checkpoint_id DESC LIMIT 1";
    const [row] = await rows<CheckpointRow>(this.pool, sql, params);
    return row ? this.tuple(row) : undefined;
  }

  async *list(config: RunnableConfig, options: CheckpointListOptions = {}): AsyncGenerator<CheckpointTuple> {
    const threadId = config.configurable?.thread_id;
    const checkpointNs = config.configurable?.checkpoint_ns;
    const checkpointId = config.configurable?.checkpoint_id;
    if (threadId !== undefined) assertIdentifier("thread_id", threadId);
    if (checkpointNs !== undefined) assertIdentifier("checkpoint_ns", checkpointNs, { allowEmpty: true });
    if (checkpointId !== undefined) assertIdentifier("checkpoint_id", checkpointId);
    const clauses: string[] = [];
    const params: any[] = [];
    if (threadId !== undefined) { clauses.push("thread_id = ?"); params.push(threadId); }
    if (checkpointNs !== undefined) { clauses.push("checkpoint_ns = ?"); params.push(checkpointNs); }
    if (checkpointId !== undefined) { clauses.push("checkpoint_id = ?"); params.push(checkpointId); }
    const before = options.before?.configurable?.checkpoint_id;
    if (before !== undefined) { assertIdentifier("checkpoint_id", before); clauses.push("checkpoint_id < ?"); params.push(before); }
    let sql = `SELECT thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id,
      checkpoint_type, checkpoint_blob, metadata_type, metadata_blob FROM ai_workflow_checkpoints`;
    if (clauses.length) sql += ` WHERE ${clauses.join(" AND ")}`;
    sql += " ORDER BY checkpoint_id DESC";
    const allRows = await rows<CheckpointRow>(this.pool, sql, params);
    let yielded = 0;
    for (const row of allRows) {
      const tuple = await this.tuple(row);
      if (options.filter && !Object.entries(options.filter).every(([key, value]) => (tuple.metadata as Record<string, unknown> | undefined)?.[key] === value)) continue;
      if (options.limit !== undefined && yielded >= options.limit) break;
      yielded += 1;
      yield tuple;
    }
  }

  async put(config: RunnableConfig, checkpoint: Checkpoint, metadata: CheckpointMetadata, _newVersions: ChannelVersions): Promise<RunnableConfig> {
    const { threadId, checkpointNs } = this.configParts(config);
    assertIdentifier("checkpoint_id", checkpoint.id);
    assertNoWorkflowSecrets(checkpoint);
    assertNoWorkflowSecrets(metadata);
    const prepared = copyCheckpoint(checkpoint);
    const [[checkpointType, checkpointBlob], [metadataType, metadataBlob]] = await Promise.all([
      this.serde.dumpsTyped(prepared),
      this.serde.dumpsTyped(metadata)
    ]);
    await this.pool.execute(
      `INSERT INTO ai_workflow_checkpoints
       (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, checkpoint_type, checkpoint_blob, metadata_type, metadata_blob)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE parent_checkpoint_id = VALUES(parent_checkpoint_id),
         checkpoint_type = VALUES(checkpoint_type), checkpoint_blob = VALUES(checkpoint_blob),
         metadata_type = VALUES(metadata_type), metadata_blob = VALUES(metadata_blob)`,
      [threadId, checkpointNs, checkpoint.id, config.configurable?.checkpoint_id ?? null, checkpointType, checkpointBlob, metadataType, metadataBlob]
    );
    return { configurable: { thread_id: threadId, checkpoint_ns: checkpointNs, checkpoint_id: checkpoint.id } };
  }

  async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string): Promise<void> {
    const { threadId, checkpointNs, checkpointId } = this.configParts(config, true);
    assertIdentifier("task_id", taskId);
    for (const [index, [channel, value]] of writes.entries()) {
      assertIdentifier("channel", channel);
      assertNoWorkflowSecrets(value);
      const writeIndex = WRITES_IDX_MAP[channel] ?? index;
      const [valueType, valueBlob] = await this.serde.dumpsTyped(value);
      await this.pool.execute(
        `INSERT INTO ai_workflow_checkpoint_writes
         (thread_id, checkpoint_ns, checkpoint_id, task_id, write_index, channel, value_type, value_blob)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           channel = IF(VALUES(write_index) < 0, VALUES(channel), channel),
           value_type = IF(VALUES(write_index) < 0, VALUES(value_type), value_type),
           value_blob = IF(VALUES(write_index) < 0, VALUES(value_blob), value_blob)`,
        [threadId, checkpointNs, checkpointId, taskId, writeIndex, channel, valueType, valueBlob]
      );
    }
  }

  async deleteThread(threadId: string): Promise<void> {
    assertIdentifier("thread_id", threadId);
    await this.pool.execute("DELETE FROM ai_workflow_checkpoint_writes WHERE thread_id = ?", [threadId]);
    await this.pool.execute("DELETE FROM ai_workflow_checkpoints WHERE thread_id = ?", [threadId]);
  }
}

export function createMysqlAiWorkflowCheckpointer(pool: mysql.Pool): BaseCheckpointSaver {
  return new MysqlAiWorkflowCheckpointer(pool);
}

function createMysqlAiWorkflowPersistencePort(pool: mysql.Pool): AiWorkflowPersistence {
  return {
    async createRun(snapshot) {
      assertNoWorkflowSecrets(snapshot);
      for (const [name, value] of Object.entries({ runId: snapshot.runId, workflowTraceId: snapshot.workflowTraceId, actorId: snapshot.actorId, tenantId: snapshot.tenantId, leadId: snapshot.leadId, modelConfigId: snapshot.modelConfigId })) {
        assertIdentifier(name, value);
      }
      try {
        await pool.execute(
          `INSERT INTO ai_workflow_runs
           (run_id, workflow_trace_id, actor_id, tenant_id, lead_id, model_config_id, status, attempt, proposal_json, outcome, effect_reference_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [snapshot.runId, snapshot.workflowTraceId, snapshot.actorId, snapshot.tenantId, snapshot.leadId, snapshot.modelConfigId,
            snapshot.status, snapshot.attempt, snapshot.proposal ? JSON.stringify(snapshot.proposal) : null, snapshot.outcome, snapshot.effectReferenceId]
        );
        return { created: true };
      } catch (error) {
        if (!isDuplicate(error)) throw error;
        return { created: false, snapshot: await this.getRun(snapshot.runId) ?? undefined };
      }
    },

    async saveSnapshot(snapshot) {
      assertNoWorkflowSecrets(snapshot);
      const result = await execute(pool,
        `UPDATE ai_workflow_runs SET status = ?, attempt = ?, proposal_json = ?, outcome = ?, effect_reference_id = ?, version = version + 1
         WHERE run_id = ? AND actor_id = ? AND tenant_id = ?`,
        [snapshot.status, snapshot.attempt, snapshot.proposal ? JSON.stringify(snapshot.proposal) : null, snapshot.outcome,
          snapshot.effectReferenceId, snapshot.runId, snapshot.actorId, snapshot.tenantId]);
      if (result.affectedRows === 0) throw new Error("AI workflow run update was rejected");
    },

    async getRun(runId) {
      assertIdentifier("run_id", runId);
      const [row] = await rows<RunRow>(pool,
        `SELECT run_id, workflow_trace_id, actor_id, tenant_id, lead_id, model_config_id, status, attempt,
          proposal_json, outcome, effect_reference_id FROM ai_workflow_runs WHERE run_id = ? LIMIT 1`, [runId]);
      return row ? snapshotFromRow(row) : null;
    },

    async claimDecision(input) {
      assertNoWorkflowSecrets(input);
      assertIdentifier("run_id", input.runId);
      assertIdentifier("actor_id", input.actorId);
      assertIdentifier("tenant_id", input.tenantId);
      try {
        await pool.execute(
          `INSERT INTO ai_workflow_approvals (run_id, attempt, decision, actor_id, tenant_id) VALUES (?, ?, ?, ?, ?)`,
          [input.runId, input.attempt, input.decision, input.actorId, input.tenantId]);
        return { claimed: true, decision: input.decision };
      } catch (error) {
        if (!isDuplicate(error)) throw error;
        const [existing] = await rows<ApprovalRow>(pool,
          `SELECT decision, actor_id, tenant_id FROM ai_workflow_approvals WHERE run_id = ? AND attempt = ? LIMIT 1`,
          [input.runId, input.attempt]);
        if (!existing || existing.actor_id !== input.actorId || existing.tenant_id !== input.tenantId) {
          throw new Error("AI workflow decision ownership mismatch");
        }
        return { claimed: false, decision: existing.decision };
      }
    },

    async appendAudit(event) {
      assertNoWorkflowSecrets(event);
      await pool.execute(
        `INSERT INTO ai_workflow_audits
         (run_id, trace_id, event_type, step, actor_id, tenant_id, lead_id, occurred_at, details_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [event.runId, event.traceId, event.type, event.step, event.actorId, event.tenantId, event.leadId,
          new Date(event.occurredAt), event.details ? JSON.stringify(event.details) : null]
      );
    }
  };
}

export interface MysqlAiWorkflowPersistenceBundle {
  checkpointer: BaseCheckpointSaver;
  persistence: AiWorkflowPersistence;
  effectStore: AiWorkflowEffectStore;
}

export interface MysqlAiWorkflowEffectStoreOptions {
  leaseMs?: number;
  pollMs?: number;
  waitMs?: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

export function createMysqlAiWorkflowEffectStore(pool: mysql.Pool, options: MysqlAiWorkflowEffectStoreOptions = {}): AiWorkflowEffectStore {
  const leaseMs = options.leaseMs ?? 30_000;
  const pollMs = options.pollMs ?? 25;
  const waitMs = options.waitMs ?? 2_000;
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  async function readEffect(idempotencyKey: string) {
    const [row] = await rows<EffectRow>(pool,
      `SELECT status, result_json, lease_expires_at FROM ai_workflow_effects WHERE idempotency_key = ? LIMIT 1`,
      [idempotencyKey]);
    return row;
  }

  async function runClaimed<T>(idempotencyKey: string, operation: () => Promise<T>): Promise<AiWorkflowEffectResult<T>> {
    try {
      const value = await operation();
      assertNoWorkflowSecrets(value);
      const resultJson = JSON.stringify(value);
      await pool.execute(
        `UPDATE ai_workflow_effects SET status = 'succeeded', result_json = ?, error_code = NULL, lease_expires_at = NULL
         WHERE idempotency_key = ? AND status = 'executing'`, [resultJson, idempotencyKey]);
      return { executed: true, value };
    } catch (error) {
      await pool.execute(
        `UPDATE ai_workflow_effects SET status = 'failed', error_code = ?, lease_expires_at = NULL
         WHERE idempotency_key = ? AND status = 'executing'`, ["operation_failed", idempotencyKey]);
      throw error;
    }
  }

  return {
    async executeOnce<T>(idempotencyKey: string, operation: () => Promise<T>): Promise<AiWorkflowEffectResult<T>> {
      assertIdentifier("idempotency_key", idempotencyKey);
      const started = now();
      try {
        await pool.execute(
          `INSERT INTO ai_workflow_effects (idempotency_key, status, lease_expires_at) VALUES (?, 'executing', ?)`,
          [idempotencyKey, new Date(started.getTime() + leaseMs)]);
        return runClaimed(idempotencyKey, operation);
      } catch (error) {
        if (!isDuplicate(error)) throw error;
      }

      const deadline = started.getTime() + waitMs;
      while (true) {
        const existing = await readEffect(idempotencyKey);
        if (!existing) throw new Error("AI workflow effect record disappeared");
        if (existing.status === "succeeded") {
          const value = existing.result_json ? JSON.parse(existing.result_json) as T : null as T;
          assertNoWorkflowSecrets(value);
          return { executed: false, value };
        }
        const leaseExpires = existing.lease_expires_at ? new Date(existing.lease_expires_at).getTime() : 0;
        const current = now().getTime();
        if (existing.status === "failed" || leaseExpires <= current) {
          const claimed = await execute(pool,
            `UPDATE ai_workflow_effects SET status = 'executing', result_json = NULL, error_code = NULL, lease_expires_at = ?
             WHERE idempotency_key = ? AND (status = 'failed' OR (status = 'executing' AND lease_expires_at <= ?))`,
            [new Date(current + leaseMs), idempotencyKey, new Date(current)]);
          if ((claimed.affectedRows ?? 0) > 0) return runClaimed(idempotencyKey, operation);
        }
        if (current >= deadline) throw new Error("Timed out waiting for AI workflow effect");
        await sleep(pollMs);
      }
    }
  };
}

export function createMysqlAiWorkflowPersistence(pool: mysql.Pool, options: MysqlAiWorkflowEffectStoreOptions = {}): MysqlAiWorkflowPersistenceBundle {
  return {
    checkpointer: createMysqlAiWorkflowCheckpointer(pool),
    persistence: createMysqlAiWorkflowPersistencePort(pool),
    effectStore: createMysqlAiWorkflowEffectStore(pool, options)
  };
}

