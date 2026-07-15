import { strict as assert } from "node:assert";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { publicUser, signToken } from "../auth.js";
import { getStore, memoryStore, setStore, type CrmStore } from "../store.js";
import type { Customer, Lead, LeadSourceEvent, User } from "../types.js";
import { registerLeadConversionRoutes } from "./lead-conversion-routes.js";

function user(id: string, role: User["role"], teamId: string): User {
  return {
    id,
    name: id,
    email: `${id}@example.test`,
    password: "unused",
    role,
    teamId,
    avatar: id.slice(0, 2).toUpperCase(),
    status: "active",
    authVersion: 1
  };
}

function lead(id: string, company: string, ownerId = "sales_eu", teamId = "europe", overrides: Partial<Lead> = {}): Lead {
  return {
    id,
    company,
    contact: `${company} Contact`,
    country: "DE",
    email: `${id}@buyer.example.test`,
    phone: "",
    wechat: "",
    source: "专项路由测试",
    intent: "高",
    stage: "新线索",
    status: "new",
    ownerId,
    teamId,
    estimatedAmount: 8000,
    nextFollowAt: "",
    lastActivityAt: "昨天",
    remark: "",
    convertedCustomerId: "",
    convertedDealId: "",
    sourceType: "outbound",
    sourceChannel: "fixture",
    sourceCampaign: "conversion-test",
    externalId: id,
    sourceUrl: `https://source.example.test/${id}`,
    createdAt: "2026-07-15T08:00:00.000Z",
    ...overrides
  };
}

function customer(id: string, company: string, ownerId = "sales_eu", teamId = "europe", documentContact = ""): Customer {
  return {
    id,
    company,
    country: "DE",
    contact: `${company} Contact`,
    ownerId,
    teamId,
    stage: "询盘",
    amount: 0,
    health: 70,
    nextReminder: "",
    wecomBound: false,
    billingName: company,
    billingAddress: "",
    documentContact,
    defaultPortDischarge: "",
    defaultIncoterm: "",
    defaultPaymentTerm: ""
  };
}

const users: User[] = [
  user("sales_eu", "sales", "europe"),
  user("sales_eu_2", "sales", "europe"),
  user("manager_eu", "manager", "europe"),
  user("sales_asia", "sales", "asia")
];

const leads: Lead[] = [
  lead("lead_preview", "Visible Match GmbH", "sales_eu", "europe", { email: "buyer@visible.example" }),
  lead("lead_create", "Create Customer Ltd"),
  lead("lead_existing", "Visible Match GmbH", "sales_eu", "europe", {
    email: "buyer@visible.example",
    nextFollowAt: "2026-08-20 15:30"
  }),
  lead("lead_persist", "Rollback Trading"),
  lead("lead_cross", "Asia Lead", "sales_asia", "asia"),
  lead("lead_deleted", "Deleted Lead", "sales_eu", "europe", { deletedAt: "2026-07-14T08:00:00.000Z" })
];

const customers: Customer[] = [
  customer("customer_visible", "Visible Match GmbH", "sales_eu", "europe", "buyer@visible.example"),
  customer("customer_same_team_hidden", "Visible Match GmbH", "sales_eu_2", "europe", "buyer@visible.example"),
  customer("customer_asia", "Visible Match GmbH", "sales_asia", "asia", "buyer@visible.example")
];

const leadSourceEvents: LeadSourceEvent[] = leads.map((item) => ({
  id: `source_${item.id}`,
  leadId: item.id,
  sourceType: item.sourceType,
  channel: item.sourceChannel,
  campaign: item.sourceCampaign,
  externalId: item.externalId,
  sourceUrl: item.sourceUrl,
  occurredAt: item.createdAt,
  receivedAt: item.createdAt,
  rawPayload: JSON.stringify({ fixture: item.id }),
  ownerId: item.ownerId,
  teamId: item.teamId
}));

let persistCount = 0;
let failNextPersist = false;
const testStore: CrmStore = {
  ...memoryStore,
  users,
  leads,
  customers,
  customerActivities: [],
  leadActivities: [],
  leadOutreachRequests: [],
  leadSourceEvents,
  deals: [],
  dealEvents: [],
  async persist() {
    persistCount += 1;
    if (failNextPersist) {
      failNextPersist = false;
      throw new Error("fixture persist failure");
    }
  }
};

const previousStore = getStore();
setStore(testStore);

const app = express();
app.use(express.json());
registerLeadConversionRoutes(app);
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ message: "参数格式错误", issues: error.issues });
    return;
  }
  res.status(500).json({ message: error instanceof Error ? error.message : "服务器内部错误" });
});

const server = app.listen(0);
const address = server.address();
if (!address || typeof address === "string") throw new Error("Cannot start lead conversion route test server");
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

try {
  const unauthenticated = await request("/api/leads/lead_preview/conversion-preview");
  assert.equal(unauthenticated.response.status, 401);

  const crossPreview = await request("/api/leads/lead_cross/conversion-preview", { headers: bearer("sales_eu") });
  assert.equal(crossPreview.response.status, 404);
  const deletedPreview = await request("/api/leads/lead_deleted/conversion-preview", { headers: bearer("sales_eu") });
  assert.equal(deletedPreview.response.status, 404);

  const preview = await request("/api/leads/lead_preview/conversion-preview", { headers: bearer("sales_eu") });
  assert.equal(preview.response.status, 200);
  assert.deepEqual(preview.json.customerMatches.map((item: { customer: { id: string } }) => item.customer.id), ["customer_visible"]);
  assert.deepEqual(preview.json.customerMatches[0].reasons, ["公司名称一致", "联系邮箱一致"]);

  const crossConvert = await request("/api/leads/lead_cross/convert", {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ customerMode: "create", createDeal: false })
  });
  assert.equal(crossConvert.response.status, 404);
  const deletedConvert = await request("/api/leads/lead_deleted/convert", {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ customerMode: "create", createDeal: false })
  });
  assert.equal(deletedConvert.response.status, 404);

  const invisibleCustomer = await request("/api/leads/lead_existing/convert", {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ customerMode: "existing", customerId: "customer_asia", createDeal: false })
  });
  assert.equal(invisibleCustomer.response.status, 404);
  assert.equal(invisibleCustomer.json.message, "要关联的客户不存在或无权访问");

  const customerCountBeforeCreate = testStore.customers.length;
  const customerOnly = await request("/api/leads/lead_create/convert", {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ customerMode: "create", createDeal: false })
  });
  assert.equal(customerOnly.response.status, 200);
  assert.equal(customerOnly.json.duplicate, false);
  assert.equal(testStore.customers.length, customerCountBeforeCreate + 1);
  assert.equal(testStore.deals.length, 0);
  assert.equal(customerOnly.json.deal, undefined);
  assert.equal(customerOnly.json.lead.convertedCustomerId, customerOnly.json.customer.id);
  assert.equal(customerOnly.json.lead.convertedDealId, "");
  assert.ok(testStore.leadActivities.some((item) => item.leadId === "lead_create" && item.type === "system"));

  const customerCountBeforeExisting = testStore.customers.length;
  const sourceEvent = testStore.leadSourceEvents.find((item) => item.leadId === "lead_existing");
  const existing = await request("/api/leads/lead_existing/convert", {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify({
      customerMode: "existing",
      customerId: "customer_visible",
      createDeal: true,
      deal: {
        title: "Initial purchase",
        product: "Industrial component",
        quantity: 20,
        unitPrice: 150,
        nextAction: "Prepare quotation"
      }
    })
  });
  assert.equal(existing.response.status, 200);
  assert.equal(existing.json.duplicate, false);
  assert.equal(existing.json.customer.id, "customer_visible");
  assert.equal(testStore.customers.length, customerCountBeforeExisting);
  assert.equal(testStore.deals.length, 1);
  assert.equal(testStore.dealEvents.length, 1);
  assert.equal(testStore.dealEvents[0].dealId, existing.json.deal.id);
  assert.equal(testStore.dealEvents[0].type, "created");
  assert.equal(existing.json.deal.nextActionAt, "2026-08-20");
  assert.equal(existing.json.lead.convertedCustomerId, "customer_visible");
  assert.equal(existing.json.lead.convertedDealId, existing.json.deal.id);
  assert.equal(testStore.leadSourceEvents.find((item) => item.leadId === "lead_existing"), sourceEvent);

  const countsBeforeDuplicate = {
    customers: testStore.customers.length,
    deals: testStore.deals.length,
    events: testStore.dealEvents.length,
    activities: testStore.leadActivities.length,
    persists: persistCount
  };
  const duplicate = await request("/api/leads/lead_existing/convert", {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ customerMode: "create", createDeal: true })
  });
  assert.equal(duplicate.response.status, 200);
  assert.equal(duplicate.json.duplicate, true);
  assert.deepEqual({
    customers: testStore.customers.length,
    deals: testStore.deals.length,
    events: testStore.dealEvents.length,
    activities: testStore.leadActivities.length,
    persists: persistCount
  }, countsBeforeDuplicate);

  const rollbackLead = testStore.leads.find((item) => item.id === "lead_persist")!;
  const rollbackLeadBefore = { ...rollbackLead };
  const rollbackCounts = {
    customers: testStore.customers.length,
    deals: testStore.deals.length,
    events: testStore.dealEvents.length,
    activities: testStore.leadActivities.length,
    sources: testStore.leadSourceEvents.length
  };
  failNextPersist = true;
  const persistFailure = await request("/api/leads/lead_persist/convert", {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify({
      customerMode: "create",
      createDeal: true,
      deal: { title: "Must roll back", product: "Fixture", quantity: 1, unitPrice: 500 }
    })
  });
  assert.equal(persistFailure.response.status, 500);
  assert.deepEqual(rollbackLead, rollbackLeadBefore);
  assert.deepEqual({
    customers: testStore.customers.length,
    deals: testStore.deals.length,
    events: testStore.dealEvents.length,
    activities: testStore.leadActivities.length,
    sources: testStore.leadSourceEvents.length
  }, rollbackCounts);
  assert.ok(testStore.leadSourceEvents.some((item) => item.leadId === "lead_persist"));

  console.log(JSON.stringify({
    ok: true,
    conversionRoutes: [
      "GET /api/leads/:id/conversion-preview",
      "POST /api/leads/:id/convert"
    ],
    visibilityVerified: true,
    sourceLineageVerified: true,
    duplicateConversionVerified: true,
    rollbackVerified: true,
    persistCount
  }, null, 2));
} finally {
  server.close();
  setStore(previousStore);
}
