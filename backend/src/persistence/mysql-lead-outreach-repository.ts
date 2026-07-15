import type mysql from "mysql2/promise";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { PersistenceConflictError, type EmailCompletion, type LeadOutreachLookup, type LeadOutreachRepository, type SocialTouchCompletion } from "../domain/leads/lead-outreach-repository.js";
import type { LeadActivity, LeadOutreachRequest } from "../types.js";
import { createMysqlUnitOfWork } from "./mysql-unit-of-work.js";

interface SqlExecutor {
  execute(sql: string, values?: unknown[]): Promise<[unknown, unknown]>;
}

interface LeadOutreachRow extends RowDataPacket {
  id: string;
  lead_id: string;
  operator_id: string;
  action: LeadOutreachRequest["action"];
  channel: string;
  idempotency_key_hash: string;
  payload_hash: string;
  status: LeadOutreachRequest["status"];
  activity_id: string | null;
  external_message_id: string | null;
  recipient: string | null;
  subject: string | null;
  error_message: string | null;
  created_at: Date | string;
  completed_at: Date | string | null;
}

function iso(value: Date | string | null | undefined) {
  if (!value) return "";
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mysqlDate(value: string) {
  return value ? new Date(value).toISOString().slice(0, 19).replace("T", " ") : null;
}

function mapRequest(row: LeadOutreachRow): LeadOutreachRequest {
  return {
    id: row.id,
    leadId: row.lead_id,
    operatorId: row.operator_id,
    action: row.action,
    channel: row.channel || "",
    idempotencyKeyHash: row.idempotency_key_hash,
    payloadHash: row.payload_hash,
    status: row.status,
    activityId: row.activity_id || "",
    externalMessageId: row.external_message_id || "",
    recipient: row.recipient || "",
    subject: row.subject || "",
    errorMessage: row.error_message || "",
    createdAt: iso(row.created_at),
    completedAt: iso(row.completed_at)
  };
}

function affectedRows(result: unknown) {
  return Number((result as ResultSetHeader | undefined)?.affectedRows || 0);
}

function duplicateKey(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ER_DUP_ENTRY");
}

async function findWith(executor: SqlExecutor, lookup: LeadOutreachLookup) {
  const [result] = await executor.execute(
    "SELECT * FROM lead_outreach_requests WHERE lead_id = ? AND operator_id = ? AND action = ? AND idempotency_key_hash = ? LIMIT 1",
    [lookup.leadId, lookup.operatorId, lookup.action, lookup.idempotencyKeyHash]
  );
  const row = (result as LeadOutreachRow[])[0];
  return row ? mapRequest(row) : undefined;
}

async function updatePendingRequest(executor: SqlExecutor, request: LeadOutreachRequest) {
  const [result] = await executor.execute(
    "UPDATE lead_outreach_requests SET status = ?, activity_id = ?, external_message_id = ?, recipient = ?, subject = ?, error_message = ?, completed_at = ? WHERE id = ? AND status = 'pending'",
    [request.status, request.activityId || "", request.externalMessageId || "", request.recipient || "", request.subject || "", request.errorMessage || "", mysqlDate(request.completedAt), request.id]
  );
  if (affectedRows(result) !== 1) {
    throw new PersistenceConflictError("Lead outreach request " + request.id + " changed concurrently");
  }
}

async function insertActivity(executor: SqlExecutor, activity: LeadActivity) {
  await executor.execute(
    "INSERT INTO lead_activities (id, lead_id, type, content, operator_id, next_follow_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [activity.id, activity.leadId, activity.type, activity.content, activity.operatorId, activity.nextFollowAt || "", mysqlDate(activity.createdAt)]
  );
}

async function updateLead(executor: SqlExecutor, completion: SocialTouchCompletion) {
  const lead = completion.lead;
  const [result] = await executor.execute(
    "UPDATE leads SET status = ?, next_follow_at = ?, last_activity_at = ? WHERE id = ? AND owner_id = ? AND team_id = ? AND deleted_at IS NULL",
    [lead.status, lead.nextFollowAt || "", lead.lastActivityAt || "", lead.id, lead.ownerId, lead.teamId]
  );
  if (affectedRows(result) !== 1) {
    throw new PersistenceConflictError("Lead " + lead.id + " changed or left the expected tenant scope");
  }
}

export function createMysqlLeadOutreachRepository(pool: mysql.Pool): LeadOutreachRepository {
  const unitOfWork = createMysqlUnitOfWork(pool);
  const poolExecutor = pool as unknown as SqlExecutor;

  return {
    async findByIdempotency(lookup) {
      return findWith(poolExecutor, lookup);
    },

    async insertPending(request) {
      try {
        await pool.execute(
          "INSERT INTO lead_outreach_requests (id, lead_id, operator_id, action, channel, idempotency_key_hash, payload_hash, status, activity_id, external_message_id, recipient, subject, error_message, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [request.id, request.leadId, request.operatorId, request.action, request.channel || "", request.idempotencyKeyHash, request.payloadHash, request.status, request.activityId || "", request.externalMessageId || "", request.recipient || "", request.subject || "", request.errorMessage || "", mysqlDate(request.createdAt), mysqlDate(request.completedAt)]
        );
        return { inserted: true, request: { ...request } };
      } catch (error) {
        if (!duplicateKey(error)) throw error;
        const existing = await findWith(poolExecutor, request);
        if (!existing) throw error;
        return { inserted: false, request: existing };
      }
    },

    async updatePending(request) {
      await updatePendingRequest(poolExecutor, request);
    },

    async completeSocialTouch(completion) {
      await unitOfWork.run(async (connection) => {
        const executor = connection as unknown as SqlExecutor;
        await updatePendingRequest(executor, completion.request);
        await insertActivity(executor, completion.activity);
        await updateLead(executor, completion);
      });
    },

    async completeEmail(completion: EmailCompletion) {
      await unitOfWork.run(async (connection) => {
        const executor = connection as unknown as SqlExecutor;
        await updatePendingRequest(executor, completion.request);
        await insertActivity(executor, completion.activity);
        await updateLead(executor, completion);
        const [result] = await executor.execute(
          "UPDATE users SET last_development_email_at = ?, last_development_email_to = ?, last_development_email_subject = ? WHERE id = ? AND team_id = ?",
          [mysqlDate(completion.user.lastDevelopmentEmailAt || ""), completion.user.lastDevelopmentEmailTo || "", completion.user.lastDevelopmentEmailSubject || "", completion.user.id, completion.user.teamId]
        );
        if (affectedRows(result) !== 1) {
          throw new PersistenceConflictError("User " + completion.user.id + " changed or left the expected tenant scope");
        }
      });
    }
  };
}
