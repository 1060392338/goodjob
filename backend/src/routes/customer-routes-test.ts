import { strict as assert } from "node:assert";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { publicUser, signToken } from "../auth.js";
import { getStore, memoryStore, setStore, type CrmStore } from "../store.js";
import type { Customer, CustomerActivity, Deal, DealEvent, Todo, User } from "../types.js";
import { registerCustomerRoutes } from "./customer-routes.js";

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

function customer(id: string, company: string, ownerId: string, teamId: string): Customer {
  return {
    id,
    company,
    country: "DE",
    contact: `${company} Contact`,
    ownerId,
    teamId,
    stage: "询盘",
    amount: 1000,
    health: 72,
    nextReminder: "明天 10:00",
    wecomBound: false,
    billingName: "",
    billingAddress: "",
    documentContact: "",
    defaultPortDischarge: "",
    defaultIncoterm: "",
    defaultPaymentTerm: ""
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

const customers: Customer[] = [
  customer("c_sales_1", "Sales One", "sales_eu", "europe"),
  customer("c_sales_2", "Team Customer", "sales_eu_2", "europe"),
  customer("c_asia", "Asia Customer", "sales_asia", "asia")
];

const customerActivities: CustomerActivity[] = [
  {
    id: "ca_existing",
    customerId: "c_sales_1",
    type: "call",
    content: "Initial call",
    operatorId: "sales_eu",
    nextReminder: "",
    createdAt: "2026-07-13T08:00:00.000Z"
  },
  {
    id: "ca_asia",
    customerId: "c_asia",
    type: "note",
    content: "Asia note",
    operatorId: "sales_asia",
    nextReminder: "",
    createdAt: "2026-07-13T09:00:00.000Z"
  }
];

const deals: Deal[] = [
  {
    id: "d_sales",
    customerId: "c_sales_1",
    title: "Sales Deal",
    stage: "已报价",
    product: "Lighting",
    quantity: 10,
    unitPrice: 200,
    amount: 2000,
    currency: "USD",
    amountType: "quoted",
    ownerId: "sales_eu",
    teamId: "europe",
    nextAction: "Follow up",
    nextActionAt: "2026-07-15",
    expectedCloseAt: "2026-08-01",
    stageChangedAt: "2026-07-13T08:00:00.000Z"
  },
  {
    id: "d_team",
    customerId: "c_sales_2",
    title: "Team Deal",
    stage: "谈判",
    product: "Accessory",
    quantity: 1,
    unitPrice: 500,
    amount: 500,
    currency: "USD",
    amountType: "estimate",
    ownerId: "sales_eu_2",
    teamId: "europe",
    nextAction: "Negotiate",
    nextActionAt: "2026-07-16",
    expectedCloseAt: "2026-08-02",
    stageChangedAt: "2026-07-13T08:00:00.000Z"
  }
];

const dealEvents: DealEvent[] = [
  { id: "de_sales", dealId: "d_sales", type: "created", content: "Created", operatorId: "sales_eu", createdAt: "2026-07-13T08:00:00.000Z" },
  { id: "de_team", dealId: "d_team", type: "created", content: "Created", operatorId: "sales_eu_2", createdAt: "2026-07-13T08:00:00.000Z" }
];

const todos: Todo[] = [
  { id: "todo_sales_related", title: "跟进 Sales One", type: "customer", priority: "high", dueAt: "2026-07-15", ownerId: "sales_eu", teamId: "europe", related: "Sales One", done: false },
  { id: "todo_other_owner", title: "跟进 Sales One", type: "customer", priority: "normal", dueAt: "2026-07-15", ownerId: "sales_eu_2", teamId: "europe", related: "Sales One", done: false },
  { id: "todo_unrelated", title: "Other work", type: "other", priority: "normal", dueAt: "2026-07-15", ownerId: "sales_eu", teamId: "europe", related: "Other", done: false }
];

let persistCount = 0;
const testStore: CrmStore = {
  ...memoryStore,
  users,
  customers,
  customerActivities,
  deals,
  dealEvents,
  todos,
  async persist() {
    persistCount += 1;
  }
};

const previousStore = getStore();
setStore(testStore);

const app = express();
app.use(express.json());
registerCustomerRoutes(app);
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ message: "参数格式错误", issues: error.issues });
    return;
  }
  res.status(500).json({ message: error instanceof Error ? error.message : "服务器内部错误" });
});

const server = app.listen(0);
const address = server.address();
if (!address || typeof address === "string") throw new Error("Cannot start customer route integration test server");
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

function customerIds(payload: Record<string, any>) {
  return payload.customers.map((item: { id: string }) => item.id).sort();
}

try {
  const unauthenticated = await request("/api/customers");
  assert.equal(unauthenticated.response.status, 401);

  const salesList = await request("/api/customers", { headers: bearer("sales_eu") });
  assert.equal(salesList.response.status, 200);
  assert.deepEqual(customerIds(salesList.json), ["c_sales_1"]);
  assert.equal(salesList.json.customers[0].ownerName, "Sales EU");
  assert.equal(salesList.json.customers[0].pipelineStage, "已报价");
  assert.equal(salesList.json.customers[0].pipelineAmount, 2000);
  assert.equal(salesList.json.customers[0].activeDealCount, 1);
  assert.equal(salesList.json.customers[0].activities[0].operatorName, "Sales EU");

  const managerList = await request("/api/customers", { headers: bearer("manager_eu") });
  assert.deepEqual(customerIds(managerList.json), ["c_sales_1", "c_sales_2"]);
  const adminList = await request("/api/customers", { headers: bearer("admin_eu") });
  assert.deepEqual(customerIds(adminList.json), ["c_sales_1", "c_sales_2"]);
  const superList = await request("/api/customers", { headers: bearer("super") });
  assert.deepEqual(customerIds(superList.json), ["c_asia", "c_sales_1", "c_sales_2"]);

  const malformed = await request("/api/customers", {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ company: "", amount: -1 })
  });
  assert.equal(malformed.response.status, 400);
  assert.equal(persistCount, 0);

  const created = await request("/api/customers", {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ company: "New Customer" })
  });
  assert.equal(created.response.status, 200);
  assert.equal(created.json.customer.ownerId, "sales_eu");
  assert.equal(created.json.customer.teamId, "europe");
  assert.equal(created.json.customer.country, "未知");
  assert.equal(created.json.customer.contact, "待维护");
  assert.equal(created.json.customer.pipelineStage, "暂无活跃商机");
  assert.equal(persistCount, 1);

  const updated = await request("/api/customers/c_sales_1", {
    method: "PATCH",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ contact: "Updated Contact", amount: 2500 })
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.json.customer.contact, "Updated Contact");
  assert.equal(updated.json.customer.amount, 2500);
  assert.equal(persistCount, 2);

  const crossOwner = await request("/api/customers/c_sales_2", {
    method: "PATCH",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ contact: "Forbidden" })
  });
  assert.equal(crossOwner.response.status, 404);
  assert.equal(crossOwner.json.message, "客户不存在");
  assert.notEqual(testStore.customers.find((item) => item.id === "c_sales_2")?.contact, "Forbidden");
  assert.equal(persistCount, 2);

  const crossTeamActivity = await request("/api/customers/c_asia/activities", {
    method: "POST",
    headers: bearer("manager_eu"),
    body: JSON.stringify({ type: "note", content: "Forbidden" })
  });
  assert.equal(crossTeamActivity.response.status, 404);
  assert.equal(crossTeamActivity.json.message, "客户不存在或无权访问");
  assert.equal(persistCount, 2);

  const activity = await request("/api/customers/c_sales_1/activities", {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ type: "email", content: " Follow-up email ", nextReminder: "明天 14:00" })
  });
  assert.equal(activity.response.status, 200);
  assert.equal(activity.json.activity.content, "Follow-up email");
  assert.equal(activity.json.activity.operatorId, "sales_eu");
  assert.equal(activity.json.customer.nextReminder, "明天 14:00");
  assert.equal(activity.json.customer.activities[0].id, activity.json.activity.id);
  assert.equal(persistCount, 3);

  const bulkDelete = await request("/api/customers/bulk-delete", {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ ids: ["c_sales_1", "c_sales_1", "c_asia"] })
  });
  assert.equal(bulkDelete.response.status, 200);
  assert.deepEqual(bulkDelete.json.deleted.map((item: { id: string }) => item.id), ["c_sales_1"]);
  assert.ok(!testStore.customers.some((item) => item.id === "c_sales_1"));
  assert.ok(testStore.customers.some((item) => item.id === "c_asia"));
  assert.ok(!testStore.customerActivities.some((item) => item.customerId === "c_sales_1"));
  assert.ok(testStore.customerActivities.some((item) => item.customerId === "c_asia"));
  assert.ok(!testStore.deals.some((item) => item.id === "d_sales"));
  assert.ok(testStore.deals.some((item) => item.id === "d_team"));
  assert.ok(!testStore.dealEvents.some((item) => item.id === "de_sales"));
  assert.ok(testStore.dealEvents.some((item) => item.id === "de_team"));
  assert.ok(!testStore.todos.some((item) => item.id === "todo_sales_related"));
  assert.ok(testStore.todos.some((item) => item.id === "todo_other_owner"));
  assert.ok(testStore.todos.some((item) => item.id === "todo_unrelated"));
  assert.equal(persistCount, 4);

  const noVisibleDelete = await request("/api/customers/bulk-delete", {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ ids: ["c_asia"] })
  });
  assert.equal(noVisibleDelete.response.status, 404);
  assert.equal(noVisibleDelete.json.message, "未找到可删除的客户");
  assert.equal(persistCount, 4);

  console.log(JSON.stringify({
    ok: true,
    customerRoutes: [
      "GET /api/customers",
      "POST /api/customers",
      "PATCH /api/customers/:id",
      "POST /api/customers/bulk-delete",
      "POST /api/customers/:id/activities"
    ],
    roleScopes: {
      sales: customerIds(salesList.json),
      manager: customerIds(managerList.json),
      admin: customerIds(adminList.json),
      superAdmin: customerIds(superList.json)
    },
    persistCount,
    cascadeCleanup: true
  }, null, 2));
} finally {
  server.close();
  setStore(previousStore);
}
