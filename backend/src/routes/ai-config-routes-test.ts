import { strict as assert } from "node:assert";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { publicUser, signToken } from "../auth.js";
import { ModelGatewayError, type ModelGateway } from "../gateways/model-gateway.js";
import { getStore, memoryStore, setStore, type CrmStore } from "../store.js";
import type { AiModelConfig, User } from "../types.js";
import { registerAiConfigRoutes } from "./ai-config-routes.js";

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

function aiConfig(id: string, ownerId: string, teamId: string, model: string, apiKey = `secret-${id}`): AiModelConfig {
  return {
    id,
    provider: "openai",
    protocol: "openai-compatible",
    name: id,
    baseUrl: "https://models.example.test/v1",
    model,
    apiKey,
    enabled: true,
    temperature: 0.1,
    useLeadFinder: true,
    useWebsiteParse: true,
    useScoring: true,
    useEmailDraft: true,
    useExam: false,
    ownerId,
    teamId,
    updatedAt: "2026-07-15T01:00:00.000Z",
    lastTestStatus: "untested",
    lastTestMessage: ""
  };
}

const users = [user("sales_eu", "europe"), user("sales_asia", "asia"), user("sales_empty", "europe")];
const aiModelConfigs = [
  aiConfig("cfg_ok", "sales_eu", "europe", "ok-model", "secret-alpha"),
  aiConfig("cfg_auth", "sales_eu", "europe", "auth-model", "secret-auth"),
  aiConfig("cfg_timeout", "sales_eu", "europe", "timeout-model", "secret-timeout"),
  aiConfig("cfg_rate", "sales_eu", "europe", "rate-model", "secret-rate"),
  aiConfig("cfg_invalid", "sales_eu", "europe", "invalid-model", "secret-invalid"),
  aiConfig("cfg_no_key", "sales_eu", "europe", "no-key-model", ""),
  aiConfig("cfg_foreign", "sales_asia", "asia", "foreign-model", "secret-foreign")
];
let persistCount = 0;
const testStore: CrmStore = {
  ...memoryStore,
  users,
  aiModelConfigs,
  async persist() {
    persistCount += 1;
  }
};

const gatewayCalls: string[] = [];
const modelGateway: ModelGateway = {
  async generateText({ config }) {
    gatewayCalls.push(config.id);
    const traceId = `trace-${config.id}`;
    if (config.model === "auth-model") throw new ModelGatewayError("authentication", "模型认证失败", traceId, false);
    if (config.model === "timeout-model") throw new ModelGatewayError("timeout", "模型请求超时", traceId, true);
    if (config.model === "rate-model") throw new ModelGatewayError("rate_limited", "模型服务限流", traceId, true);
    if (config.model === "invalid-model") return { content: "not-json", traceId, provider: config.provider, model: config.model };
    return { content: '{"ok":true}', traceId, provider: config.provider, model: config.model };
  }
};

const assertedEndpoints: string[] = [];
const app = express();
app.use(express.json());
registerAiConfigRoutes(app, {
  modelGateway,
  allowPrivateEndpoints: () => false,
  assertPublicEndpoint: async (url) => { assertedEndpoints.push(url); },
  now: () => new Date("2026-07-15T02:00:00.000Z")
});
app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    res.status(400).json({ message: error.issues.map((issue) => issue.message).join("; ") });
    return;
  }
  res.status(500).json({ message: error instanceof Error ? error.message : "internal error" });
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
  const anonymous = await request("/api/tools/ai-config");
  assert.equal(anonymous.response.status, 401);

  const visible = await request("/api/tools/ai-config", { headers: bearer("sales_eu") });
  assert.equal(visible.response.status, 200);
  assert.equal(visible.json.configs.length, 6);
  assert.ok(visible.json.configs.every((item: any) => item.ownerId === "sales_eu"));
  const visibleText = JSON.stringify(visible.json);
  for (const secret of ["secret-alpha", "secret-auth", "secret-timeout", "secret-rate", "secret-invalid", "secret-foreign"]) {
    assert.ok(!visibleText.includes(secret));
  }
  assert.equal(visible.json.configs.find((item: any) => item.id === "cfg_ok").apiKey, "****lpha");

  const empty = await request("/api/tools/ai-config", { headers: bearer("sales_empty") });
  assert.equal(empty.response.status, 200);
  assert.equal(empty.json.config, null);
  assert.deepEqual(empty.json.configs, []);

  const missingEnabledKey = await request("/api/tools/ai-config", {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ baseUrl: "https://new-model.example.test/v1", model: "new-model", enabled: true })
  });
  assert.equal(missingEnabledKey.response.status, 400);

  const saved = await request("/api/tools/ai-config", {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify({
      id: "cfg_new",
      provider: "custom",
      protocol: "openai-compatible",
      name: "New config",
      baseUrl: "https://new-model.example.test/v1/",
      model: "new-model",
      apiKey: "new-secret-key",
      enabled: true
    })
  });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.json.config.baseUrl, "https://new-model.example.test/v1");
  assert.equal(saved.json.config.apiKey, "****-key");
  assert.ok(!JSON.stringify(saved.json).includes("new-secret-key"));
  assert.equal(assertedEndpoints.at(-1), "https://new-model.example.test/v1/");

  const maskedUpdate = await request("/api/tools/ai-config", {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify({
      id: "cfg_ok",
      baseUrl: "https://models.example.test/v1",
      model: "ok-model-v2",
      apiKey: "****lpha",
      enabled: true
    })
  });
  assert.equal(maskedUpdate.response.status, 200);
  assert.equal(aiModelConfigs.find((item) => item.id === "cfg_ok")?.apiKey, "secret-alpha");

  const foreignUpdate = await request("/api/tools/ai-config", {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify({
      id: "cfg_foreign",
      baseUrl: "https://models.example.test/v1",
      model: "stolen-model",
      apiKey: "replacement",
      enabled: true
    })
  });
  assert.equal(foreignUpdate.response.status, 404);
  assert.equal(aiModelConfigs.find((item) => item.id === "cfg_foreign")?.model, "foreign-model");

  const missingTest = await request("/api/tools/ai-config/test", {
    method: "POST",
    headers: bearer("sales_empty"),
    body: JSON.stringify({})
  });
  assert.equal(missingTest.response.status, 400);
  assert.equal(gatewayCalls.length, 0);

  const noKeyTest = await request("/api/tools/ai-config/test", {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ id: "cfg_no_key" })
  });
  assert.equal(noKeyTest.response.status, 400);
  assert.equal(gatewayCalls.length, 0);

  const foreignTest = await request("/api/tools/ai-config/test", {
    method: "POST",
    headers: bearer("sales_eu"),
    body: JSON.stringify({ id: "cfg_foreign" })
  });
  assert.equal(foreignTest.response.status, 400);
  assert.equal(gatewayCalls.length, 0);

  for (const [id, ok, pattern] of [
    ["cfg_ok", true, /连接测试通过/],
    ["cfg_auth", false, /认证失败/],
    ["cfg_timeout", false, /超时/],
    ["cfg_rate", false, /限流/],
    ["cfg_invalid", false, /结构化测试结果/]
  ] as const) {
    const tested = await request("/api/tools/ai-config/test", {
      method: "POST",
      headers: bearer("sales_eu"),
      body: JSON.stringify({ id })
    });
    assert.equal(tested.response.status, 200);
    assert.equal(tested.json.ok, ok);
    assert.match(String(tested.json.message), pattern);
    assert.equal(tested.json.config.lastTestStatus, ok ? "passed" : "failed");
    assert.equal(tested.json.config.lastTestAt, "2026-07-15T02:00:00.000Z");
    assert.ok(!JSON.stringify(tested.json).includes(aiModelConfigs.find((item) => item.id === id)?.apiKey || "never"));
  }
  assert.deepEqual(gatewayCalls, ["cfg_ok", "cfg_auth", "cfg_timeout", "cfg_rate", "cfg_invalid"]);

  const foreignDelete = await request("/api/tools/ai-config/cfg_foreign", { method: "DELETE", headers: bearer("sales_eu") });
  assert.equal(foreignDelete.response.status, 404);
  assert.ok(aiModelConfigs.some((item) => item.id === "cfg_foreign"));

  const ownDelete = await request("/api/tools/ai-config/cfg_new", { method: "DELETE", headers: bearer("sales_eu") });
  assert.equal(ownDelete.response.status, 200);
  assert.ok(!aiModelConfigs.some((item) => item.id === "cfg_new"));

  assert.equal(persistCount, 8);
  console.log(JSON.stringify({
    ok: true,
    routes: [
      "GET /api/tools/ai-config",
      "POST /api/tools/ai-config",
      "DELETE /api/tools/ai-config/:id",
      "POST /api/tools/ai-config/test"
    ],
    gatewayCalls: gatewayCalls.length,
    realOutboundCalls: 0,
    tenantIsolation: true,
    secretRedaction: true,
    failuresInjected: ["authentication", "timeout", "rate_limited", "invalid_structured_response"]
  }, null, 2));
} finally {
  server.close();
  setStore(previousStore);
}
