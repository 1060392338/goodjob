import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { createMemoryLeadOutreachRepository, PersistenceConflictError, type LeadOutreachRepository } from "../domain/leads/lead-outreach-repository.js";
import { createMysqlLeadOutreachRepository } from "./mysql-lead-outreach-repository.js";
import { createMysqlUnitOfWork } from "./mysql-unit-of-work.js";
import type { Lead, LeadActivity, LeadOutreachRequest, User } from "../types.js";
import type mysql from "mysql2/promise";

function request(overrides: Partial<LeadOutreachRequest> = {}): LeadOutreachRequest {
  return { id: "lor_1", leadId: "lead_1", operatorId: "sales_1", action: "social-touch", channel: "linkedin", idempotencyKeyHash: "k".repeat(64), payloadHash: "p".repeat(64), status: "pending", activityId: "", externalMessageId: "", recipient: "", subject: "", errorMessage: "", createdAt: "2026-07-15T00:00:00.000Z", completedAt: "", ...overrides };
}

function lead(overrides: Partial<Lead> = {}): Lead {
  return { id: "lead_1", company: "Buyer", contact: "Contact", country: "DE", email: "", phone: "", wechat: "", source: "test", intent: "中", stage: "新线索", status: "new", ownerId: "sales_1", teamId: "team_1", estimatedAmount: 1, nextFollowAt: "", lastActivityAt: "昨天", remark: "", convertedCustomerId: "", convertedDealId: "", sourceType: "outbound", sourceChannel: "test", sourceCampaign: "", externalId: "lead_1", sourceUrl: "", createdAt: "2026-07-15T00:00:00.000Z", ...overrides };
}

function activity(id = "la_1", type: LeadActivity["type"] = "linkedin"): LeadActivity {
  return { id, leadId: "lead_1", type, content: "touch", operatorId: "sales_1", nextFollowAt: "", createdAt: "2026-07-15T00:01:00.000Z" };
}

function user(overrides: Partial<User> = {}): User {
  return { id: "sales_1", name: "Sales", email: "sales@example.test", password: "unused", role: "sales", teamId: "team_1", avatar: "S", status: "active", ...overrides };
}

interface FakeState {
  requests: LeadOutreachRequest[];
  leads: Lead[];
  activities: LeadActivity[];
  users: User[];
}

function requestRow(item: LeadOutreachRequest) {
  return { id: item.id, lead_id: item.leadId, operator_id: item.operatorId, action: item.action, channel: item.channel, idempotency_key_hash: item.idempotencyKeyHash, payload_hash: item.payloadHash, status: item.status, activity_id: item.activityId, external_message_id: item.externalMessageId, recipient: item.recipient, subject: item.subject, error_message: item.errorMessage, created_at: item.createdAt, completed_at: item.completedAt || null };
}

class FakeMysqlPool {
  state: FakeState;
  readonly statements: string[] = [];
  readonly events: string[] = [];
  failOn = "";

  constructor(state: FakeState) {
    this.state = structuredClone(state);
  }

  async execute(sql: string, values: unknown[] = []) {
    this.statements.push(sql);
    return executeSql(this.state, sql, values, this.failOn);
  }

  async getConnection() {
    return new FakeConnection(this);
  }
}

class FakeConnection {
  private working: FakeState;

  constructor(private readonly pool: FakeMysqlPool) {
    this.working = structuredClone(pool.state);
  }

  async beginTransaction() {
    this.pool.events.push("begin");
    this.working = structuredClone(this.pool.state);
  }

  async execute(sql: string, values: unknown[] = []) {
    this.pool.statements.push(sql);
    return executeSql(this.working, sql, values, this.pool.failOn);
  }

  async commit() {
    this.pool.events.push("commit");
    this.pool.state = structuredClone(this.working);
  }

  async rollback() {
    this.pool.events.push("rollback");
  }

  release() {
    this.pool.events.push("release");
  }
}

function executeSql(state: FakeState, sql: string, values: unknown[], failOn: string): [unknown, unknown[]] {
  if (failOn && sql.includes(failOn)) throw new Error("injected SQL failure");
  if (sql.startsWith("SELECT * FROM lead_outreach_requests")) {
    const [leadId, operatorId, action, keyHash] = values.map(String);
    const found = state.requests.find((item) => item.leadId === leadId && item.operatorId === operatorId && item.action === action && item.idempotencyKeyHash === keyHash);
    return [found ? [requestRow(found)] : [], []];
  }
  if (sql.startsWith("INSERT INTO lead_outreach_requests")) {
    const [id, leadId, operatorId, action, channel, keyHash, payloadHash, status, activityId, externalMessageId, recipient, subject, errorMessage, createdAt, completedAt] = values;
    const duplicate = state.requests.some((item) => item.leadId === leadId && item.operatorId === operatorId && item.action === action && item.idempotencyKeyHash === keyHash);
    if (duplicate) throw Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" });
    state.requests.unshift(request({ id: String(id), leadId: String(leadId), operatorId: String(operatorId), action: action as LeadOutreachRequest["action"], channel: String(channel), idempotencyKeyHash: String(keyHash), payloadHash: String(payloadHash), status: status as LeadOutreachRequest["status"], activityId: String(activityId), externalMessageId: String(externalMessageId), recipient: String(recipient), subject: String(subject), errorMessage: String(errorMessage), createdAt: new Date(String(createdAt)).toISOString(), completedAt: completedAt ? new Date(String(completedAt)).toISOString() : "" }));
    return [{ affectedRows: 1 }, []];
  }
  if (sql.startsWith("UPDATE lead_outreach_requests")) {
    const [status, activityId, externalMessageId, recipient, subject, errorMessage, completedAt, id] = values;
    const existing = state.requests.find((item) => item.id === id && item.status === "pending");
    if (!existing) return [{ affectedRows: 0 }, []];
    Object.assign(existing, { status, activityId, externalMessageId, recipient, subject, errorMessage, completedAt: completedAt ? new Date(String(completedAt)).toISOString() : "" });
    return [{ affectedRows: 1 }, []];
  }
  if (sql.startsWith("INSERT INTO lead_activities")) {
    const [id, leadId, type, content, operatorId, nextFollowAt, createdAt] = values;
    if (state.activities.some((item) => item.id === id)) throw Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" });
    state.activities.unshift({ id: String(id), leadId: String(leadId), type: type as LeadActivity["type"], content: String(content), operatorId: String(operatorId), nextFollowAt: String(nextFollowAt), createdAt: new Date(String(createdAt)).toISOString() });
    return [{ affectedRows: 1 }, []];
  }
  if (sql.startsWith("UPDATE leads")) {
    const [status, nextFollowAt, lastActivityAt, id, ownerId, teamId] = values;
    const existing = state.leads.find((item) => item.id === id && item.ownerId === ownerId && item.teamId === teamId && !item.deletedAt);
    if (!existing) return [{ affectedRows: 0 }, []];
    Object.assign(existing, { status, nextFollowAt, lastActivityAt });
    return [{ affectedRows: 1 }, []];
  }
  if (sql.startsWith("UPDATE users")) {
    const [lastAt, lastTo, lastSubject, id, teamId] = values;
    const existing = state.users.find((item) => item.id === id && item.teamId === teamId);
    if (!existing) return [{ affectedRows: 0 }, []];
    Object.assign(existing, { lastDevelopmentEmailAt: lastAt ? new Date(String(lastAt)).toISOString() : "", lastDevelopmentEmailTo: lastTo, lastDevelopmentEmailSubject: lastSubject });
    return [{ affectedRows: 1 }, []];
  }
  throw new Error("Unexpected SQL: " + sql);
}

async function repositoryContract(name: string, repository: LeadOutreachRepository) {
  const pending = request();
  const inserted = await repository.insertPending(pending);
  assert.equal(inserted.inserted, true, name);
  const duplicate = await repository.insertPending({ ...pending });
  assert.equal(duplicate.inserted, false, name);
  assert.equal(duplicate.request.id, pending.id, name);
  const found = await repository.findByIdempotency({ leadId: pending.leadId, operatorId: pending.operatorId, action: pending.action, idempotencyKeyHash: pending.idempotencyKeyHash });
  assert.equal(found?.payloadHash, pending.payloadHash, name);

  const completed = { ...pending, status: "succeeded" as const, activityId: "la_1", completedAt: "2026-07-15T00:01:00.000Z" };
  await repository.completeSocialTouch({ request: completed, lead: lead({ status: "following", lastActivityAt: "刚刚" }), activity: activity() });
  const after = await repository.findByIdempotency({ leadId: pending.leadId, operatorId: pending.operatorId, action: pending.action, idempotencyKeyHash: pending.idempotencyKeyHash });
  assert.equal(after?.status, "succeeded", name);
  await assert.rejects(() => repository.completeSocialTouch({ request: completed, lead: lead(), activity: activity() }), PersistenceConflictError, name);

  const failed = request({ id: "lor_failed", idempotencyKeyHash: "f".repeat(64), status: "pending" });
  await repository.insertPending(failed);
  await repository.updatePending({ ...failed, status: "failed", errorMessage: "safe public error", completedAt: "2026-07-15T00:02:00.000Z" });
  const failedAfter = await repository.findByIdempotency({ leadId: failed.leadId, operatorId: failed.operatorId, action: failed.action, idempotencyKeyHash: failed.idempotencyKeyHash });
  assert.equal(failedAfter?.status, "failed", name);

  const email = request({ id: "lor_email", action: "send-email", channel: "email", idempotencyKeyHash: "e".repeat(64) });
  await repository.insertPending(email);
  await repository.completeEmail({ request: { ...email, status: "succeeded", activityId: "la_email", recipient: "buyer@example.test", subject: "Hello", completedAt: "2026-07-15T00:03:00.000Z" }, lead: lead({ status: "following" }), activity: activity("la_email", "email"), user: user({ lastDevelopmentEmailAt: "2026-07-15T00:03:00.000Z", lastDevelopmentEmailTo: "buyer@example.test", lastDevelopmentEmailSubject: "Hello" }) });
  const emailAfter = await repository.findByIdempotency({ leadId: email.leadId, operatorId: email.operatorId, action: email.action, idempotencyKeyHash: email.idempotencyKeyHash });
  assert.equal(emailAfter?.status, "succeeded", name);
}

const memory = createMemoryLeadOutreachRepository({ leads: [lead()], users: [user()] });
await repositoryContract("memory", memory);
assert.equal(memory.snapshot().activities.length, 2);

const fakePool = new FakeMysqlPool({ requests: [], leads: [lead()], activities: [], users: [user()] });
const mysqlRepository = createMysqlLeadOutreachRepository(fakePool as unknown as mysql.Pool);
await repositoryContract("mysql", mysqlRepository);
assert.equal(fakePool.state.activities.length, 2);
assert.ok(fakePool.statements.every((sql) => !/^(DELETE|TRUNCATE)\b|persistAll/i.test(sql)));
assert.ok(fakePool.statements.some((sql) => sql.includes("owner_id = ? AND team_id = ?")));
assert.ok(fakePool.statements.some((sql) => sql.includes("users") && sql.includes("team_id = ?")));

const rollbackRequest = request({ id: "lor_rollback", idempotencyKeyHash: "r".repeat(64) });
await mysqlRepository.insertPending(rollbackRequest);
const beforeRollback = structuredClone(fakePool.state);
fakePool.failOn = "INSERT INTO lead_activities";
await assert.rejects(() => mysqlRepository.completeSocialTouch({ request: { ...rollbackRequest, status: "succeeded", activityId: "la_rollback", completedAt: "2026-07-15T00:04:00.000Z" }, lead: lead({ status: "following" }), activity: activity("la_rollback") }), /injected SQL failure/);
fakePool.failOn = "";
assert.deepEqual(fakePool.state, beforeRollback);
assert.ok(fakePool.events.includes("commit"));
assert.ok(fakePool.events.includes("rollback"));
assert.equal(fakePool.events.filter((item) => item === "begin").length, fakePool.events.filter((item) => item === "release").length);

const isolatedPool = new FakeMysqlPool({ requests: [], leads: [lead()], activities: [], users: [user()] });
const unitOfWork = createMysqlUnitOfWork(isolatedPool as unknown as mysql.Pool);
await unitOfWork.run(async () => "ok");
await assert.rejects(() => unitOfWork.run(async () => { throw new Error("work failed"); }), /work failed/);
assert.deepEqual(isolatedPool.events, ["begin", "commit", "release", "begin", "rollback", "release"]);

const failingMemory = createMemoryLeadOutreachRepository({ requests: [rollbackRequest], leads: [lead()], beforeCommit(operation) { if (operation === "complete-social-touch") throw new Error("memory commit failed"); } });
const memoryBeforeRollback = failingMemory.snapshot();
await assert.rejects(() => failingMemory.completeSocialTouch({ request: { ...rollbackRequest, status: "succeeded", activityId: "la_memory_rollback" }, lead: lead({ status: "following" }), activity: activity("la_memory_rollback") }), /memory commit failed/);
assert.deepEqual(failingMemory.snapshot(), memoryBeforeRollback);

const mysqlStoreSource = readFileSync(new URL("../mysql-store.ts", import.meta.url), "utf8");
assert.doesNotMatch(mysqlStoreSource, /replaceRows\(connection, ["\']lead_outreach_requests["\']/);

console.log(JSON.stringify({ ok: true, contract: ["memory", "mysql"], mysqlCommits: fakePool.events.filter((item) => item === "commit").length, mysqlRollbacks: fakePool.events.filter((item) => item === "rollback").length, rowLevelStatements: fakePool.statements.length, fullSnapshotWrites: 0, tenantPredicates: true }, null, 2));
