import { strict as assert } from "node:assert";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { publicUser, signToken } from "../auth.js";
import { getStore, memoryStore, setStore, type CrmStore } from "../store.js";
import type { Lead, LeadActivity, LeadSourceEvent, User } from "../types.js";
import { registerLeadRoutes } from "./lead-routes.js";

function user(id: string, name: string, role: User["role"], teamId: string): User {
  return {
    id,
    name,
    email: `${id}@example.test`,
    password: "unused",
    role,
    teamId,
    avatar: name.slice(0, 2).toUpperCase(),
    status: "active",
    authVersion: 1
  };
}

function lead(
  id: string,
  company: string,
  ownerId: string,
  teamId: string,
  overrides: Partial<Lead> = {}
): Lead {
  return {
    id,
    company,
    contact: `${company} Contact`,
    country: "DE",
    email: `${id}@example.test`,
    phone: "",
    wechat: "",
    source: "测试来源",
    intent: "中",
    stage: "新线索",
    status: "new",
    ownerId,
    teamId,
    estimatedAmount: 1000,
    nextFollowAt: "",
    lastActivityAt: "昨天",
    remark: "",
    convertedCustomerId: "",
    convertedDealId: "",
    sourceType: "outbound",
    sourceChannel: "fixture",
    sourceCampaign: "",
    externalId: id,
    sourceUrl: "",
    createdAt: "2026-07-13T08:00:00.000Z",
    ...overrides
  };
}

const users: User[] = [
  user("sales_eu", "Sales EU", "sales", "europe"),
  user("sales_eu_2", "Sales EU 2", "sales", "europe"),
  user("manager_eu", "Manager EU", "manager", "europe"),
  user("admin_eu", "Admin EU", "admin", "europe"),
  user("sales_asia", "Sales Asia", "sales", "asia"),
  user("super", "Super Admin", "super_admin", "global")
];

const leads: Lead[] = [
  lead("lead_sales", "Sales Lead", "sales_eu", "europe"),
  lead("lead_team", "Team Lead", "sales_eu_2", "europe", { status: "following", stage: "跟进中" }),
  lead("lead_asia", "Asia Lead", "sales_asia", "asia"),
  lead("lead_converted", "Converted Lead", "sales_eu", "europe", {
    status: "converted",
    stage: "已转客户",
    convertedCustomerId: "customer_existing"
  }),
  lead("lead_restore", "Restore Lead", "sales_eu", "europe", {
    status: "invalid",
    deletedAt: "2026-07-10T08:00:00.000Z",
    deletedReason: "暂时搁置",
    deletedBy: "sales_eu",
    purgeAt: "2026-08-09T08:00:00.000Z",
    statusBeforeDelete: "following"
  }),
  lead("lead_permanent", "Permanent Lead", "sales_eu", "europe", {
    status: "invalid",
    deletedAt: "2026-07-09T08:00:00.000Z",
    deletedReason: "重复数据",
    deletedBy: "sales_eu",
    purgeAt: "2026-08-08T08:00:00.000Z",
    statusBeforeDelete: "new"
  })
];

const leadActivities: LeadActivity[] = [
  {
    id: "activity_old",
    leadId: "lead_sales",
    type: "call",
    content: "Older activity",
    operatorId: "sales_eu",
    nextFollowAt: "",
    createdAt: "2026-07-13T08:00:00.000Z"
  },
  {
    id: "activity_new",
    leadId: "lead_sales",
    type: "note",
    content: "Newer activity",
    operatorId: "sales_eu",
    nextFollowAt: "",
    createdAt: "2026-07-13T10:00:00.000Z"
  },
  {
    id: "activity_permanent",
    leadId: "lead_permanent",
    type: "system",
    content: "Trash activity",
    operatorId: "sales_eu",
    nextFollowAt: "",
    createdAt: "2026-07-09T08:00:00.000Z"
  }
];

const leadSourceEvents: LeadSourceEvent[] = [
  {
    id: "source_old",
    leadId: "lead_sales",
    sourceType: "outbound",
    channel: "website",
    campaign: "spring",
    externalId: "sales-old",
    sourceUrl: "https://example.test/old",
    occurredAt: "2026-07-13T07:00:00.000Z",
    receivedAt: "2026-07-13T08:00:00.000Z",
    rawPayload: "{}",
    ownerId: "sales_eu",
    teamId: "europe"
  },
  {
    id: "source_new",
    leadId: "lead_sales",
    sourceType: "inbound",
    channel: "website",
    campaign: "summer",
    externalId: "sales-new",
    sourceUrl: "https://example.test/new",
    occurredAt: "2026-07-13T09:00:00.000Z",
    receivedAt: "2026-07-13T10:00:00.000Z",
    rawPayload: "{}",
    ownerId: "sales_eu",
    teamId: "europe"
  },
  {
    id: "source_cross_tenant",
    leadId: "lead_sales",
    sourceType: "import",
    channel: "foreign-tenant",
    campaign: "",
    externalId: "cross-tenant",
    sourceUrl: "",
    occurredAt: "2026-07-13T11:00:00.000Z",
    receivedAt: "2026-07-13T11:00:00.000Z",
    rawPayload: "{}",
    ownerId: "sales_asia",
    teamId: "asia"
  },
  {
    id: "source_permanent_1",
    leadId: "lead_permanent",
    sourceType: "import",
    channel: "csv",
    campaign: "",
    externalId: "permanent-1",
    sourceUrl: "",
    occurredAt: "2026-07-09T07:00:00.000Z",
    receivedAt: "2026-07-09T08:00:00.000Z",
    rawPayload: "{}",
    ownerId: "sales_eu",
    teamId: "europe"
  },
  {
    id: "source_permanent_2",
    leadId: "lead_permanent",
    sourceType: "import",
    channel: "csv",
    campaign: "",
    externalId: "permanent-2",
    sourceUrl: "",
    occurredAt: "2026-07-09T09:00:00.000Z",
    receivedAt: "2026-07-09T10:00:00.000Z",
    rawPayload: "{}",
    ownerId: "sales_eu",
    teamId: "europe"
  }
];

let persistCount = 0;
const testStore: CrmStore = {
  ...memoryStore,
  users,
  leads,
  leadActivities,
  leadSourceEvents,
  customers: [],
  deals: [],
  async persist() {
    persistCount += 1;
  }
};

const previousStore = getStore();
setStore(testStore);

const app = express();
app.use(express.json());
registerLeadRoutes(app);
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ message: "参数格式错误", issues: error.issues });
    return;
  }
  res.status(500).json({ message: error instanceof Error ? error.message : "服务器内部错误" });
});

const server = app.listen(0);
const address = server.address();
if (!address || typeof address === "string") throw new Error("Cannot start lead route integration test server");
const baseUrl = `http://127.0.0.1:${address.port}`;

function token(userId: string) {
  const account = users.find((item) => item.id === userId);
  if (!account) throw new Error(`Unknown test user: ${userId}`);
  return signToken(publicUser(account));
}

function bearer(userId: string) {
  return { authorization: `Bearer ${token(userId)}` };
}

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(baseUrl + path, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  return { response, json: await response.json() as Record<string, any> };
}

function leadIds(payload: Record<string, any>) {
  return payload.leads.map((item: { id: string }) => item.id).sort();
}

try {
  const unauthenticated = await request("/api/leads");
  assert.equal(unauthenticated.response.status, 401);

  const salesList = await request("/api/leads", { headers: bearer("sales_eu") });
  assert.equal(salesList.response.status, 200);
  assert.deepEqual(leadIds(salesList.json), ["lead_converted", "lead_sales"]);

  const managerList = await request("/api/leads", { headers: bearer("manager_eu") });
  assert.deepEqual(leadIds(managerList.json), ["lead_converted", "lead_sales", "lead_team"]);
  const adminList = await request("/api/leads", { headers: bearer("admin_eu") });
  assert.deepEqual(leadIds(adminList.json), ["lead_converted", "lead_sales", "lead_team"]);
  const superList = await request("/api/leads", { headers: bearer("super") });
  assert.deepEqual(leadIds(superList.json), ["lead_asia", "lead_converted", "lead_sales", "lead_team"]);

  const trashList = await request("/api/leads?trash=true", { headers: bearer("sales_eu") });
  assert.deepEqual(leadIds(trashList.json), ["lead_permanent", "lead_restore"]);
  assert.ok(!trashList.json.leads.some((item: Lead) => item.id === "lead_sales"));

  const forbiddenDetail = await request("/api/leads/lead_asia", { headers: bearer("manager_eu") });
  assert.equal(forbiddenDetail.response.status, 404);
  assert.equal(forbiddenDetail.json.message, "线索不存在或无权访问");

  const detail = await request("/api/leads/lead_sales", { headers: bearer("sales_eu") });
  assert.equal(detail.response.status, 200);
  assert.deepEqual(detail.json.activities.map((item: LeadActivity) => item.id), ["activity_new", "activity_old"]);
  assert.deepEqual(detail.json.sourceEvents.map((item: LeadSourceEvent) => item.id), ["source_new", "source_old"]);
  assert.ok(!detail.json.sourceEvents.some((item: LeadSourceEvent) => item.id === "source_cross_tenant"));

  const malformed = await request("/api/leads", {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ company: "", estimatedAmount: -1 })
  });
  assert.equal(malformed.response.status, 400);
  assert.equal(persistCount, 0);

  const created = await request("/api/leads", {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ company: "Manual Lead", sourceChannel: "  " })
  });
  assert.equal(created.response.status, 200);
  assert.equal(created.json.duplicate, false);
  assert.equal(created.json.lead.ownerId, "sales_eu");
  assert.equal(created.json.lead.teamId, "europe");
  assert.equal(created.json.lead.sourceChannel, "manual");
  assert.equal(created.json.sourceEvent.ownerId, "sales_eu");
  assert.equal(created.json.sourceEvent.teamId, "europe");
  assert.equal(persistCount, 1);

  const ingestPayload = {
    company: "Imported Lead",
    source: "CSV 导入",
    sourceType: "import",
    sourceChannel: "csv-import",
    externalId: "external-001",
    occurredAt: "2026-07-14T08:00:00.000Z",
    rawPayload: { row: 12, original: "traceable" }
  };
  const ingested = await request("/api/leads/ingest", {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify(ingestPayload)
  });
  assert.equal(ingested.response.status, 201);
  assert.equal(ingested.json.duplicate, false);
  assert.equal(ingested.json.sourceEvent.externalId, "external-001");
  assert.deepEqual(JSON.parse(ingested.json.sourceEvent.rawPayload), ingestPayload.rawPayload);
  const countsAfterFirstIngest = {
    leads: testStore.leads.length,
    activities: testStore.leadActivities.length,
    sourceEvents: testStore.leadSourceEvents.length
  };
  assert.equal(persistCount, 2);

  const duplicateIngest = await request("/api/leads/ingest", {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ ...ingestPayload, company: "Should Not Replace Existing" })
  });
  assert.equal(duplicateIngest.response.status, 200);
  assert.equal(duplicateIngest.json.duplicate, true);
  assert.equal(duplicateIngest.json.lead.id, ingested.json.lead.id);
  assert.deepEqual({
    leads: testStore.leads.length,
    activities: testStore.leadActivities.length,
    sourceEvents: testStore.leadSourceEvents.length
  }, countsAfterFirstIngest);
  assert.equal(persistCount, 3);

  const otherOwnerIngest = await request("/api/leads/ingest", {
    method: "POST",
    headers: bearer("sales_eu_2"),
    body: JSON.stringify(ingestPayload)
  });
  assert.equal(otherOwnerIngest.response.status, 201);
  assert.equal(otherOwnerIngest.json.duplicate, false);
  assert.notEqual(otherOwnerIngest.json.lead.id, ingested.json.lead.id);
  assert.equal(otherOwnerIngest.json.lead.ownerId, "sales_eu_2");
  assert.equal(persistCount, 4);

  const stageActivityCount = testStore.leadActivities.length;
  const patched = await request("/api/leads/lead_sales", {
    method: "PATCH",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ stage: "已联系", remark: " Qualified " })
  });
  assert.equal(patched.response.status, 200);
  assert.equal(patched.json.lead.stage, "已联系");
  assert.equal(patched.json.lead.remark, " Qualified ");
  assert.equal(testStore.leadActivities.length, stageActivityCount + 1);
  assert.equal(testStore.leadActivities[0]?.type, "stage");
  assert.equal(testStore.leadActivities[0]?.content, "阶段变更：新线索 → 已联系");
  assert.equal(persistCount, 5);

  const forbiddenPatch = await request("/api/leads/lead_asia", {
    method: "PATCH",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ remark: "Forbidden" })
  });
  assert.equal(forbiddenPatch.response.status, 404);
  assert.notEqual(testStore.leads.find((item) => item.id === "lead_asia")?.remark, "Forbidden");
  assert.equal(persistCount, 5);

  const trashed = await request("/api/leads/lead_sales", {
    method: "DELETE",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ reason: "当前无采购计划" })
  });
  assert.equal(trashed.response.status, 200);
  assert.equal(trashed.json.lead.status, "invalid");
  assert.equal(trashed.json.lead.statusBeforeDelete, "new");
  assert.equal(trashed.json.lead.deletedReason, "当前无采购计划");
  assert.equal(trashed.json.lead.deletedBy, "sales_eu");
  assert.ok(Date.parse(trashed.json.lead.purgeAt) > Date.parse(trashed.json.lead.deletedAt));
  assert.equal(persistCount, 6);

  const convertedDelete = await request("/api/leads/lead_converted", {
    method: "DELETE",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ reason: "Should fail" })
  });
  assert.equal(convertedDelete.response.status, 400);
  assert.equal(convertedDelete.json.message, "已转客户的线索必须保留来源追溯，不能移入垃圾箱");
  assert.equal(persistCount, 6);

  const restored = await request("/api/leads/lead_restore/restore", {
    method: "POST",
    headers: bearer("sales_eu")
  });
  assert.equal(restored.response.status, 200);
  assert.equal(restored.json.lead.status, "following");
  assert.equal(restored.json.lead.deletedAt, "");
  assert.equal(restored.json.lead.statusBeforeDelete, undefined);
  assert.equal(persistCount, 7);

  const permanentlyDeleted = await request("/api/leads/lead_permanent/permanent", {
    method: "DELETE",
    headers: bearer("sales_eu")
  });
  assert.equal(permanentlyDeleted.response.status, 200);
  assert.equal(permanentlyDeleted.json.ok, true);
  assert.equal(permanentlyDeleted.json.id, "lead_permanent");
  assert.equal(permanentlyDeleted.json.sourceEventsDeleted, 2);
  assert.ok(!testStore.leads.some((item) => item.id === "lead_permanent"));
  assert.ok(!testStore.leadActivities.some((item) => item.leadId === "lead_permanent"));
  assert.ok(!testStore.leadSourceEvents.some((item) => item.leadId === "lead_permanent"));
  assert.equal(persistCount, 8);

  const activity = await request(`/api/leads/${created.json.lead.id}/activities`, {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ type: "email", content: " Send catalog ", nextFollowAt: "2026-07-20" })
  });
  assert.equal(activity.response.status, 200);
  assert.equal(activity.json.activity.content, " Send catalog ");
  assert.equal(activity.json.activity.operatorId, "sales_eu");
  assert.equal(activity.json.lead.nextFollowAt, "2026-07-20");
  assert.equal(activity.json.lead.status, "following");
  assert.equal(persistCount, 9);

  console.log(JSON.stringify({
    ok: true,
    leadRoutes: [
      "GET /api/leads",
      "GET /api/leads/:id",
      "POST /api/leads",
      "POST /api/leads/ingest",
      "PATCH /api/leads/:id",
      "DELETE /api/leads/:id",
      "POST /api/leads/:id/restore",
      "DELETE /api/leads/:id/permanent",
      "POST /api/leads/:id/activities"
    ],
    roleScopes: {
      sales: leadIds(salesList.json),
      manager: leadIds(managerList.json),
      admin: leadIds(adminList.json),
      superAdmin: leadIds(superList.json)
    },
    sourceIdempotency: "ownerId + sourceChannel + externalId",
    sourceTenantFilter: true,
    cascadeCleanup: true,
    persistCount
  }, null, 2));
} finally {
  server.close();
  setStore(previousStore);
}
