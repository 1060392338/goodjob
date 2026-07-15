import { strict as assert } from "node:assert";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { publicUser, signToken } from "../auth.js";
import type { OutboundEmailGateway } from "../gateways/outbound-email-gateway.js";
import { getStore, memoryStore, setStore, type CrmStore } from "../store.js";
import type { Lead, User } from "../types.js";
import { registerLeadOutreachRoutes } from "./lead-outreach-routes.js";

function user(id: string, role: User["role"], teamId: string, smtp = false): User {
  return {
    id,
    name: id,
    email: `${id}@example.test`,
    password: "unused",
    role,
    teamId,
    avatar: id.slice(0, 2).toUpperCase(),
    status: "active",
    authVersion: 1,
    ...(smtp ? {
      outboundEmail: `${id}@mail.example.test`,
      emailSenderName: "GoodJob Sales",
      smtpHost: "smtp.example.test",
      smtpPort: 465,
      smtpSecure: true,
      smtpUser: `${id}@mail.example.test`,
      smtpPassword: "test-only-password"
    } : {})
  };
}

function lead(id: string, ownerId = "sales_eu", teamId = "europe", overrides: Partial<Lead> = {}): Lead {
  return {
    id,
    company: `${id} Company`,
    contact: `${id} Contact`,
    country: "DE",
    email: `${id}@buyer.example.test`,
    phone: "",
    wechat: "",
    source: "专项路由测试",
    intent: "中",
    stage: "新线索",
    status: "new",
    ownerId,
    teamId,
    estimatedAmount: 3000,
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
    createdAt: "2026-07-15T08:00:00.000Z",
    ...overrides
  };
}

const users: User[] = [
  user("sales_eu", "sales", "europe", true),
  user("manager_eu", "manager", "europe"),
  user("sales_asia", "sales", "asia")
];

const leads: Lead[] = [
  lead("lead_social"),
  lead("lead_email"),
  lead("lead_email_authfail"),
  lead("lead_email_timeout"),
  lead("lead_email_persist"),
  lead("lead_cross", "sales_asia", "asia"),
  lead("lead_deleted", "sales_eu", "europe", { deletedAt: "2026-07-14T08:00:00.000Z" })
];

let persistCount = 0;
let failAtPersist = -1;
const testStore: CrmStore = {
  ...memoryStore,
  users,
  leads,
  customers: [],
  customerActivities: [],
  leadActivities: [],
  leadOutreachRequests: [],
  leadSourceEvents: [],
  deals: [],
  dealEvents: [],
  async persist() {
    persistCount += 1;
    if (persistCount === failAtPersist) throw new Error("fixture persist failure");
  }
};

let gatewayCalls = 0;
const gatewayCallsByRecipient = new Map<string, number>();
const emailGateway: OutboundEmailGateway = {
  async send(_account, payload) {
    gatewayCalls += 1;
    gatewayCallsByRecipient.set(payload.to, (gatewayCallsByRecipient.get(payload.to) || 0) + 1);
    if (payload.to.includes("authfail")) {
      throw Object.assign(new Error("Invalid login"), { code: "EAUTH" });
    }
    if (payload.to.includes("timeout")) {
      throw Object.assign(new Error("socket timeout"), { code: "ETIMEDOUT" });
    }
    return { messageId: `message-${gatewayCalls}` };
  }
};

const previousStore = getStore();
setStore(testStore);

const app = express();
app.use(express.json());
registerLeadOutreachRoutes(app, { emailGateway });
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ message: "参数格式错误", issues: error.issues });
    return;
  }
  res.status(500).json({ message: error instanceof Error ? error.message : "服务器内部错误" });
});

const server = app.listen(0);
const address = server.address();
if (!address || typeof address === "string") throw new Error("Cannot start lead outreach route test server");
const baseUrl = `http://127.0.0.1:${address.port}`;

function token(userId: string) {
  const account = users.find((item) => item.id === userId);
  if (!account) throw new Error(`Unknown test user: ${userId}`);
  return signToken(publicUser(account));
}

function bearer(userId: string, idempotencyKey?: string) {
  return {
    authorization: `Bearer ${token(userId)}`,
    ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {})
  };
}

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(baseUrl + path, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  return { response, json: await response.json() as Record<string, any> };
}

function activitiesFor(leadId: string) {
  return testStore.leadActivities.filter((item) => item.leadId === leadId);
}

try {
  const unauthenticated = await request("/api/leads/lead_social/social-touch", {
    method: "POST",
    body: JSON.stringify({ channel: "linkedin", message: "Hello" })
  });
  assert.equal(unauthenticated.response.status, 401);

  const crossTeam = await request("/api/leads/lead_cross/social-touch", {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ channel: "linkedin", message: "Forbidden" })
  });
  assert.equal(crossTeam.response.status, 404);

  const deleted = await request("/api/leads/lead_deleted/send-email", {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ to: "deleted@buyer.test", subject: "Deleted", body: "This must not be sent." })
  });
  assert.equal(deleted.response.status, 404);
  assert.equal(gatewayCalls, 0);

  const socialBody = { channel: "whatsapp", message: "Manual follow-up recorded", nextFollowAt: "2026-07-20 10:00" };
  const social = await request("/api/leads/lead_social/social-touch", {
    method: "POST",
    headers: bearer("sales_eu", "social-key-001"),
    body: JSON.stringify(socialBody)
  });
  assert.equal(social.response.status, 200);
  assert.equal(social.json.lead.status, "following");
  assert.equal(social.json.lead.nextFollowAt, socialBody.nextFollowAt);
  assert.equal(activitiesFor("lead_social").length, 1);
  assert.equal(activitiesFor("lead_social")[0].type, "whatsapp");
  assert.equal(testStore.leadOutreachRequests[0].status, "succeeded");
  assert.equal(testStore.leadOutreachRequests[0].idempotencyKeyHash.length, 64);
  assert.notEqual(testStore.leadOutreachRequests[0].idempotencyKeyHash, "social-key-001");
  const persistAfterSocial = persistCount;

  const socialDuplicate = await request("/api/leads/lead_social/social-touch", {
    method: "POST",
    headers: bearer("sales_eu", "social-key-001"),
    body: JSON.stringify(socialBody)
  });
  assert.equal(socialDuplicate.response.status, 200);
  assert.equal(socialDuplicate.json.duplicate, true);
  assert.equal(activitiesFor("lead_social").length, 1);
  assert.equal(persistCount, persistAfterSocial);

  const socialConflict = await request("/api/leads/lead_social/social-touch", {
    method: "POST",
    headers: bearer("sales_eu", "social-key-001"),
    body: JSON.stringify({ ...socialBody, message: "Different payload" })
  });
  assert.equal(socialConflict.response.status, 409);
  assert.equal(activitiesFor("lead_social").length, 1);

  const emailBody = {
    to: "success@buyer.test",
    subject: "Product follow-up",
    body: "This is a sufficient integration test email body.",
    nextFollowAt: "2026-07-21 09:30"
  };
  const email = await request("/api/leads/lead_email/send-email", {
    method: "POST",
    headers: bearer("sales_eu", "email-key-001"),
    body: JSON.stringify(emailBody)
  });
  assert.equal(email.response.status, 200);
  assert.equal(email.json.sent.messageId, "message-1");
  assert.equal(email.json.sent.to, emailBody.to);
  assert.equal(gatewayCallsByRecipient.get(emailBody.to), 1);
  assert.equal(activitiesFor("lead_email").length, 1);
  assert.equal(testStore.leads.find((item) => item.id === "lead_email")?.status, "following");
  assert.equal(testStore.users.find((item) => item.id === "sales_eu")?.lastDevelopmentEmailTo, emailBody.to);
  const emailRequest = testStore.leadOutreachRequests.find((item) => item.leadId === "lead_email");
  assert.equal(emailRequest?.status, "succeeded");
  assert.equal(emailRequest?.recipient, emailBody.to);
  assert.equal(emailRequest?.subject, emailBody.subject);
  assert.ok(!JSON.stringify(emailRequest).includes(emailBody.body));
  assert.ok(!JSON.stringify(emailRequest).includes("email-key-001"));

  const emailDuplicate = await request("/api/leads/lead_email/send-email", {
    method: "POST",
    headers: bearer("sales_eu", "email-key-001"),
    body: JSON.stringify(emailBody)
  });
  assert.equal(emailDuplicate.response.status, 200);
  assert.equal(emailDuplicate.json.duplicate, true);
  assert.equal(emailDuplicate.json.sent.messageId, email.json.sent.messageId);
  assert.equal(gatewayCallsByRecipient.get(emailBody.to), 1);
  assert.equal(activitiesFor("lead_email").length, 1);

  const emailConflict = await request("/api/leads/lead_email/send-email", {
    method: "POST",
    headers: bearer("sales_eu", "email-key-001"),
    body: JSON.stringify({ ...emailBody, subject: "Changed subject" })
  });
  assert.equal(emailConflict.response.status, 409);
  assert.equal(gatewayCallsByRecipient.get(emailBody.to), 1);

  const authFailure = await request("/api/leads/lead_email_authfail/send-email", {
    method: "POST",
    headers: bearer("sales_eu", "email-key-authfail"),
    body: JSON.stringify({ to: "authfail@buyer.test", subject: "Auth failure", body: "This email should fail authentication." })
  });
  assert.equal(authFailure.response.status, 400);
  assert.match(String(authFailure.json.message), /SMTP认证失败/);
  assert.equal(activitiesFor("lead_email_authfail").length, 0);
  assert.equal(testStore.leadOutreachRequests.find((item) => item.leadId === "lead_email_authfail")?.status, "failed");

  const timeoutBody = { to: "timeout@buyer.test", subject: "Timeout", body: "This email has an uncertain timeout result." };
  const timeout = await request("/api/leads/lead_email_timeout/send-email", {
    method: "POST",
    headers: bearer("sales_eu", "email-key-timeout"),
    body: JSON.stringify(timeoutBody)
  });
  assert.equal(timeout.response.status, 400);
  assert.match(String(timeout.json.message), /SMTP连接失败/);
  assert.equal(activitiesFor("lead_email_timeout").length, 0);
  assert.equal(testStore.leadOutreachRequests.find((item) => item.leadId === "lead_email_timeout")?.status, "pending");
  const timeoutCalls = gatewayCallsByRecipient.get(timeoutBody.to);

  const timeoutDuplicate = await request("/api/leads/lead_email_timeout/send-email", {
    method: "POST",
    headers: bearer("sales_eu", "email-key-timeout"),
    body: JSON.stringify(timeoutBody)
  });
  assert.equal(timeoutDuplicate.response.status, 409);
  assert.equal(gatewayCallsByRecipient.get(timeoutBody.to), timeoutCalls);

  const persistLead = testStore.leads.find((item) => item.id === "lead_email_persist")!;
  const account = testStore.users.find((item) => item.id === "sales_eu")!;
  const leadBeforePersistFailure = { ...persistLead };
  const userBeforePersistFailure = { ...account };
  const persistBody = { to: "persist@buyer.test", subject: "Persist failure", body: "Gateway succeeds but final persistence fails." };
  failAtPersist = persistCount + 2;
  const persistFailure = await request("/api/leads/lead_email_persist/send-email", {
    method: "POST",
    headers: bearer("sales_eu", "email-key-persist"),
    body: JSON.stringify(persistBody)
  });
  failAtPersist = -1;
  assert.equal(persistFailure.response.status, 500);
  assert.deepEqual(persistLead, leadBeforePersistFailure);
  assert.deepEqual(account, userBeforePersistFailure);
  assert.equal(activitiesFor("lead_email_persist").length, 0);
  assert.equal(testStore.leadOutreachRequests.find((item) => item.leadId === "lead_email_persist")?.status, "pending");
  assert.equal(gatewayCallsByRecipient.get(persistBody.to), 1);

  const persistRetry = await request("/api/leads/lead_email_persist/send-email", {
    method: "POST",
    headers: bearer("sales_eu", "email-key-persist"),
    body: JSON.stringify(persistBody)
  });
  assert.equal(persistRetry.response.status, 409);
  assert.equal(gatewayCallsByRecipient.get(persistBody.to), 1);

  console.log(JSON.stringify({
    ok: true,
    outreachRoutes: [
      "POST /api/leads/:id/social-touch",
      "POST /api/leads/:id/send-email"
    ],
    gatewayCalls,
    persistedRequests: testStore.leadOutreachRequests.length,
    idempotencyVerified: true,
    pendingRecoveryVerified: true,
    rollbackVerified: true
  }, null, 2));
} finally {
  server.close();
  setStore(previousStore);
}
