import { strict as assert } from "node:assert";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { publicUser, signToken } from "../auth.js";
import { LeadSourceConnectorError, type LeadSourceConnector, type LeadSourceDescriptor } from "../connectors/lead-source-connector.js";
import { getStore, memoryStore, setStore, type CrmStore } from "../store.js";
import type { LeadSourceConfig, User } from "../types.js";
import { registerLeadSourceConfigRoutes } from "./lead-source-config-routes.js";

function user(id: string, teamId: string): User {
  return {
    id,
    name: id,
    email: `${id}@example.test`,
    password: "unused",
    role: "sales",
    teamId,
    avatar: id.slice(0, 2),
    status: "active",
    authVersion: 1
  };
}

function sourceConfig(id: string, provider: string, ownerId: string, teamId: string, apiKey: string): LeadSourceConfig {
  return {
    id,
    provider,
    scope: "personal",
    apiKey,
    baseUrl: "",
    enabled: true,
    lastTestStatus: "untested",
    lastTestMessage: "",
    ownerId,
    teamId,
    updatedAt: "2026-07-15T03:00:00.000Z"
  };
}

const descriptors: LeadSourceDescriptor[] = [
  { id: "serper", name: "Serper", tier: "byok_free", category: "web", requiresKey: true, capabilities: ["web"], docsUrl: "https://serper.example.test", keyHint: "key", defaultBaseUrl: "https://source.example.test", costNote: "mock" },
  { id: "hunter", name: "Hunter", tier: "paid", category: "email", requiresKey: true, capabilities: ["email"], docsUrl: "https://hunter.example.test", keyHint: "key", defaultBaseUrl: "https://hunter.example.test", costNote: "mock" },
  { id: "gleif", name: "GLEIF", tier: "free", category: "company", requiresKey: false, capabilities: ["company"], docsUrl: "https://gleif.example.test", keyHint: "", defaultBaseUrl: "https://gleif.example.test", costNote: "free" }
];

const users = [user("sales_eu", "europe"), user("sales_asia", "asia"), user("sales_empty", "europe")];
const leadSourceConfigs = [
  sourceConfig("source_eu_serper", "serper", "sales_eu", "europe", "secret-eu-1001"),
  sourceConfig("source_asia_serper", "serper", "sales_asia", "asia", "secret-asia-2002"),
  sourceConfig("source_eu_hunter", "hunter", "sales_eu", "europe", "secret-auth-3003")
];
let persistCount = 0;
const testStore: CrmStore = {
  ...memoryStore,
  users,
  leadSourceConfigs,
  aiModelConfigs: [],
  async persist() {
    persistCount += 1;
  }
};

const connectorCalls: Array<{ provider: string; apiKey: string; baseUrl?: string }> = [];
const connector: LeadSourceConnector = {
  listProviders: () => descriptors,
  findProvider: (provider) => descriptors.find((item) => item.id === provider),
  async testConnection(request) {
    connectorCalls.push({ provider: request.provider, ...request.credential });
    if (request.credential.apiKey.includes("auth")) {
      throw new LeadSourceConnectorError("authentication", "API Key 无效：[REDACTED]", "trace-auth", false);
    }
    if (request.credential.apiKey.includes("generic")) {
      throw new Error(`unexpected ${request.credential.apiKey}`);
    }
    return { ok: true, message: "连接通过", usage: "本月 1/100", provider: request.provider, traceId: "trace-ok" };
  },
  async searchPage() {
    throw new Error("not used by config routes");
  }
};

const assertedEndpoints: string[] = [];
const app = express();
app.use(express.json());
registerLeadSourceConfigRoutes(app, {
  connector,
  assertPublicEndpoint: async (url) => {
    assertedEndpoints.push(url);
    if (url.includes("127.0.0.1")) throw new Error("private endpoint");
  },
  now: () => new Date("2026-07-15T04:00:00.000Z")
});
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ message: "参数格式错误", issues: error.issues });
    return;
  }
  res.status(500).json({ message: "服务器处理请求失败" });
});

const previousStore = getStore();
setStore(testStore);
const server = app.listen(0);
await new Promise<void>((resolve) => server.once("listening", resolve));
const address = server.address();
assert.ok(address && typeof address === "object");
const baseUrl = `http://127.0.0.1:${address.port}`;

function bearer(userId: string) {
  const account = users.find((item) => item.id === userId)!;
  return { authorization: `Bearer ${signToken(publicUser(account))}`, "content-type": "application/json" };
}

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const json = await response.json() as any;
  return { response, json };
}

try {
  const anonymous = await request("/api/lead-finder/providers");
  assert.equal(anonymous.response.status, 401);

  const visible = await request("/api/lead-finder/providers", { headers: bearer("sales_eu") });
  assert.equal(visible.response.status, 200);
  assert.equal(visible.json.providers.length, 4);
  assert.equal(visible.json.providers.find((item: any) => item.id === "serper").hasApiKey, true);
  assert.equal(visible.json.providers.find((item: any) => item.id === "gleif").ready, true);
  assert.equal(visible.json.providers.find((item: any) => item.id === "ai_search").requiresKey, false);
  assert.ok(!JSON.stringify(visible.json).includes("secret-eu-1001"));
  assert.ok(!JSON.stringify(visible.json).includes("secret-asia-2002"));

  const unknown = await request("/api/lead-finder/source-config", {
    method: "POST",
    headers: bearer("sales_empty"),
    body: JSON.stringify({ provider: "unknown", apiKey: "secret", enabled: true })
  });
  assert.equal(unknown.response.status, 404);

  const missingKey = await request("/api/lead-finder/source-config", {
    method: "POST",
    headers: bearer("sales_empty"),
    body: JSON.stringify({ provider: "serper", enabled: true })
  });
  assert.equal(missingKey.response.status, 400);
  assert.equal(leadSourceConfigs.filter((item) => item.ownerId === "sales_empty").length, 0);

  const saved = await request("/api/lead-finder/source-config", {
    method: "POST",
    headers: bearer("sales_empty"),
    body: JSON.stringify({ provider: "serper", apiKey: "secret-empty-4004", baseUrl: "https://source.example.test/v1", enabled: true })
  });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.json.config.apiKey, "****4004");
  assert.equal(saved.json.config.hasApiKey, true);
  assert.ok(!JSON.stringify(saved.json).includes("secret-empty-4004"));
  assert.equal(leadSourceConfigs.find((item) => item.ownerId === "sales_empty")?.apiKey, "secret-empty-4004");
  assert.equal(leadSourceConfigs.find((item) => item.ownerId === "sales_eu" && item.provider === "serper")?.apiKey, "secret-eu-1001");
  assert.deepEqual(assertedEndpoints, ["https://source.example.test/v1"]);

  const maskedUpdate = await request("/api/lead-finder/source-config", {
    method: "POST",
    headers: bearer("sales_empty"),
    body: JSON.stringify({ provider: "serper", apiKey: "****4004", enabled: true })
  });
  assert.equal(maskedUpdate.response.status, 200);
  assert.equal(leadSourceConfigs.find((item) => item.ownerId === "sales_empty")?.apiKey, "secret-empty-4004");
  assert.equal(leadSourceConfigs.find((item) => item.ownerId === "sales_empty")?.baseUrl, "https://source.example.test/v1");

  const beforePrivateCalls = connectorCalls.length;
  const privateUrl = await request("/api/lead-finder/source-config", {
    method: "POST",
    headers: bearer("sales_empty"),
    body: JSON.stringify({ provider: "serper", apiKey: "secret-private", baseUrl: "http://127.0.0.1:9000", enabled: true })
  });
  assert.equal(privateUrl.response.status, 500);
  assert.equal(connectorCalls.length, beforePrivateCalls);
  assert.equal(leadSourceConfigs.find((item) => item.ownerId === "sales_empty")?.apiKey, "secret-empty-4004");

  const connected = await request("/api/lead-finder/source-config/test", {
    method: "POST",
    headers: bearer("sales_empty"),
    body: JSON.stringify({ provider: "serper" })
  });
  assert.equal(connected.response.status, 200);
  assert.equal(connected.json.ok, true);
  assert.equal(connected.json.usage, "本月 1/100");
  assert.equal(connectorCalls.at(-1)?.apiKey, "secret-empty-4004");
  const emptyConfig = leadSourceConfigs.find((item) => item.ownerId === "sales_empty" && item.provider === "serper")!;
  assert.equal(emptyConfig.lastTestStatus, "passed");
  assert.equal(emptyConfig.lastTestAt, "2026-07-15T04:00:00.000Z");
  assert.equal(emptyConfig.usageJson, "本月 1/100");

  const beforeForeignTest = connectorCalls.length;
  const foreignTest = await request("/api/lead-finder/source-config/test", {
    method: "POST",
    headers: bearer("sales_asia"),
    body: JSON.stringify({ provider: "hunter" })
  });
  assert.equal(foreignTest.response.status, 400);
  assert.equal(connectorCalls.length, beforeForeignTest);
  assert.equal(leadSourceConfigs.find((item) => item.id === "source_eu_hunter")?.lastTestStatus, "untested");

  const authFailure = await request("/api/lead-finder/source-config/test", {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ provider: "hunter" })
  });
  assert.equal(authFailure.response.status, 200);
  assert.equal(authFailure.json.ok, false);
  assert.ok(!JSON.stringify(authFailure.json).includes("secret-auth-3003"));
  assert.equal(leadSourceConfigs.find((item) => item.id === "source_eu_hunter")?.lastTestStatus, "failed");

  await request("/api/lead-finder/source-config", {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ provider: "hunter", apiKey: "secret-generic-5005", enabled: true })
  });
  const genericFailure = await request("/api/lead-finder/source-config/test", {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ provider: "hunter" })
  });
  assert.equal(genericFailure.response.status, 200);
  assert.equal(genericFailure.json.ok, false);
  assert.equal(genericFailure.json.message, "连接异常：数据源连接失败");
  assert.ok(!JSON.stringify(genericFailure.json).includes("secret-generic-5005"));

  const beforeForeignDelete = leadSourceConfigs.length;
  const foreignDelete = await request("/api/lead-finder/source-config/hunter", {
    method: "DELETE",
    headers: bearer("sales_asia")
  });
  assert.equal(foreignDelete.response.status, 404);
  assert.equal(leadSourceConfigs.length, beforeForeignDelete);
  assert.ok(leadSourceConfigs.some((item) => item.provider === "hunter" && item.ownerId === "sales_eu"));

  const deleted = await request("/api/lead-finder/source-config/serper", {
    method: "DELETE",
    headers: bearer("sales_empty")
  });
  assert.equal(deleted.response.status, 200);
  assert.equal(deleted.json.providers.find((item: any) => item.id === "serper").hasApiKey, false);
  assert.ok(!leadSourceConfigs.some((item) => item.provider === "serper" && item.ownerId === "sales_empty"));
  assert.ok(leadSourceConfigs.some((item) => item.provider === "serper" && item.ownerId === "sales_eu"));
  assert.ok(leadSourceConfigs.some((item) => item.provider === "serper" && item.ownerId === "sales_asia"));

  assert.ok(persistCount >= 6);
  console.log(JSON.stringify({
    ok: true,
    routes: 4,
    connectorCalls: connectorCalls.length,
    realOutboundCalls: 0,
    tenantIsolation: ["read", "save", "test", "delete"],
    secretRedaction: true,
    ssrfRejectedBeforeConnector: true
  }, null, 2));
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  setStore(previousStore);
}
