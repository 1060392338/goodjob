import assert from "node:assert/strict";
import { createLeadSourceConnector, LeadSourceConnectorError } from "./lead-source-connector.js";
import type { LeadProvider, ProviderCredential } from "../lead-providers.js";

let testCalls = 0;
let searchCalls = 0;
let mode: "ok" | "auth" | "rate" | "invalid" | "timeout" | "provider" = "ok";
const provider: LeadProvider = {
  id: "mock",
  name: "Mock Source",
  tier: "byok_free",
  category: "web",
  requiresKey: true,
  capabilities: ["web"],
  docsUrl: "https://docs.example.test",
  keyHint: "test only",
  defaultBaseUrl: "https://source.example.test",
  costNote: "mock",
  async test(credential: ProviderCredential) {
    testCalls += 1;
    if (mode === "auth") return { ok: false, message: `API Key 无效：${credential.apiKey}` };
    if (mode === "rate") return { ok: false, message: "连接失败：HTTP 429 rate limit" };
    if (mode === "invalid") return { message: "missing ok" } as any;
    if (mode === "timeout") throw new Error(`timeout https://source.example.test/test?api_key=${encodeURIComponent(credential.apiKey)}`);
    if (mode === "provider") throw new Error(`Authorization: Bearer ${credential.apiKey}; HTTP 503`);
    return { ok: true, message: "连接通过", usage: "本月 1/100" };
  },
  async search(_query, credential) {
    searchCalls += 1;
    return {
      leads: [{ company: "Acme", website: "https://acme.example", description: credential.apiKey ? "mock" : "" }],
      calls: 1,
      usage: "1 call"
    };
  }
};

const assertedEndpoints: string[] = [];
let rejectEndpoint = false;
let trace = 0;
const connector = createLeadSourceConnector({
  providers: [provider],
  assertEndpoint: async (url) => {
    assertedEndpoints.push(url);
    if (rejectEndpoint) throw new Error("private endpoint");
  },
  createTraceId: () => `lead-trace-${++trace}`
});

async function expectConnectorError(run: () => Promise<unknown>, code: LeadSourceConnectorError["code"], secret?: string) {
  try {
    await run();
    assert.fail(`expected ${code}`);
  } catch (error) {
    assert.ok(error instanceof LeadSourceConnectorError);
    assert.equal(error.code, code);
    assert.ok(error.traceId.startsWith("lead-trace-"));
    if (secret) assert.ok(!error.message.includes(secret));
    return error;
  }
}

const descriptors = connector.listProviders();
assert.equal(descriptors.length, 1);
assert.equal(descriptors[0].id, "mock");
assert.equal(connector.findProvider("mock")?.requiresKey, true);
assert.equal(connector.findProvider("unknown"), undefined);

const beforeMissing = testCalls;
await expectConnectorError(() => connector.testConnection({ provider: "mock", credential: { apiKey: "" } }), "unconfigured");
assert.equal(testCalls, beforeMissing);
await expectConnectorError(() => connector.testConnection({ provider: "unknown", credential: { apiKey: "secret" } }), "unconfigured", "secret");
assert.equal(testCalls, beforeMissing);

mode = "ok";
const connected = await connector.testConnection({ provider: "mock", credential: { apiKey: "secret-ok", baseUrl: "https://source.example.test/v1" } });
assert.equal(connected.ok, true);
assert.equal(connected.provider, "mock");
assert.equal(connected.traceId, "lead-trace-3");
assert.equal(connected.usage, "本月 1/100");
assert.deepEqual(assertedEndpoints, ["https://source.example.test/v1"]);

mode = "auth";
const authError = await expectConnectorError(() => connector.testConnection({ provider: "mock", credential: { apiKey: "secret-auth" } }), "authentication", "secret-auth");
assert.equal(authError.retryable, false);

mode = "rate";
const rateError = await expectConnectorError(() => connector.testConnection({ provider: "mock", credential: { apiKey: "secret-rate" } }), "rate_limited", "secret-rate");
assert.equal(rateError.retryable, true);

mode = "invalid";
await expectConnectorError(() => connector.testConnection({ provider: "mock", credential: { apiKey: "secret-invalid" } }), "invalid_response", "secret-invalid");

mode = "timeout";
const timeoutError = await expectConnectorError(() => connector.testConnection({ provider: "mock", credential: { apiKey: "secret timeout" } }), "timeout", "secret timeout");
assert.equal(timeoutError.retryable, true);
assert.ok(!timeoutError.message.includes(encodeURIComponent("secret timeout")));

mode = "provider";
const providerError = await expectConnectorError(() => connector.testConnection({ provider: "mock", credential: { apiKey: "secret-provider" } }), "provider_error", "secret-provider");
assert.equal(providerError.retryable, true);
assert.ok(!/Bearer\s+secret/i.test(providerError.message));

rejectEndpoint = true;
const beforeSecurity = testCalls;
await expectConnectorError(() => connector.testConnection({ provider: "mock", credential: { apiKey: "secret-security", baseUrl: "http://127.0.0.1:9999" } }), "security_rejected", "secret-security");
assert.equal(testCalls, beforeSecurity);
rejectEndpoint = false;

mode = "ok";
const page = await connector.searchPage({
  provider: "mock",
  credential: { apiKey: "secret-search", baseUrl: "https://source.example.test" },
  query: { goal: "", productKeywords: "lighting", countries: "DE", industry: "", customerType: "", excludeKeywords: "", limit: 10 }
});
assert.equal(page.leads.length, 1);
assert.equal(page.calls, 1);
assert.equal(page.exhausted, true);
assert.equal(page.nextCursor, undefined);
assert.equal(page.nextCheckpoint, undefined);
assert.equal(searchCalls, 1);
const beforeCheckpoint = searchCalls;
await expectConnectorError(() => connector.searchPage({
  provider: "mock",
  credential: { apiKey: "secret-search" },
  query: { goal: "", productKeywords: "lighting", countries: "DE", industry: "", customerType: "", excludeKeywords: "", limit: 10 },
  checkpoint: { page: 2 }
}), "provider_error", "secret-search");
assert.equal(searchCalls, beforeCheckpoint);

console.log(JSON.stringify({
  ok: true,
  providers: descriptors.length,
  connectionCalls: testCalls,
  searchCalls,
  realOutboundCalls: 0,
  errorClasses: ["unconfigured", "authentication", "timeout", "rate_limited", "invalid_response", "provider_error", "security_rejected"],
  paginationContract: ["cursor", "checkpoint", "nextCursor", "nextCheckpoint", "exhausted"]
}, null, 2));
