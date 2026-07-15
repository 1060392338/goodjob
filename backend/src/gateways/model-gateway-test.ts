import { strict as assert } from "node:assert";
import type { AiModelConfig } from "../types.js";
import { createHttpModelGateway, ModelGatewayError } from "./model-gateway.js";

function config(protocol: AiModelConfig["protocol"], overrides: Partial<AiModelConfig> = {}): AiModelConfig {
  return {
    id: `config_${protocol}`,
    provider: protocol === "openai-compatible" ? "openai" : protocol,
    protocol,
    name: "Contract test",
    baseUrl: "https://models.example.test/v1",
    model: "test-model",
    apiKey: "secret-model-key",
    enabled: true,
    temperature: 0.2,
    useLeadFinder: true,
    useWebsiteParse: true,
    useScoring: true,
    useEmailDraft: true,
    useExam: false,
    ownerId: "sales_eu",
    teamId: "europe",
    updatedAt: "2026-07-15T00:00:00.000Z",
    ...overrides
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function expectGatewayError(promise: Promise<unknown>, code: ModelGatewayError["code"]) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ModelGatewayError);
    assert.equal(error.code, code);
    assert.ok(error.traceId);
    assert.ok(!error.message.includes("secret-model-key"));
    return true;
  });
}

const assertedEndpoints: string[] = [];
const openAiCalls: Array<{ url: string; init?: RequestInit }> = [];
const openAiGateway = createHttpModelGateway({
  createTraceId: () => "trace-openai",
  assertEndpoint: async (url) => assertedEndpoints.push(url),
  request: async (url, init) => {
    openAiCalls.push({ url, init });
    return jsonResponse({ choices: [{ message: { content: "{\"ok\":true}" } }], usage: { total_tokens: 9 } });
  }
});
const openAiResult = await openAiGateway.generateText({ config: config("openai-compatible"), prompt: "ping", maxInputChars: 4 });
assert.equal(openAiResult.content, '{"ok":true}');
assert.equal(openAiResult.traceId, "trace-openai");
assert.deepEqual(openAiResult.usage, { total_tokens: 9 });
assert.equal(assertedEndpoints[0], "https://models.example.test/v1");
assert.equal(openAiCalls[0]?.url, "https://models.example.test/v1/chat/completions");
assert.equal((openAiCalls[0]?.init?.headers as Record<string, string>).authorization, "Bearer secret-model-key");
assert.equal(JSON.parse(String(openAiCalls[0]?.init?.body)).messages[1].content, "ping");

let anthropicUrl = "";
const anthropicGateway = createHttpModelGateway({
  allowPrivateEndpoints: () => true,
  createTraceId: () => "trace-anthropic",
  request: async (url, init) => {
    anthropicUrl = url;
    assert.equal((init?.headers as Record<string, string>)["x-api-key"], "secret-model-key");
    return jsonResponse({ content: [{ type: "text", text: "anthropic-ok" }], usage: { input_tokens: 3 } });
  }
});
const anthropicResult = await anthropicGateway.generateText({ config: config("anthropic"), prompt: "hello" });
assert.equal(anthropicUrl, "https://models.example.test/v1/messages");
assert.equal(anthropicResult.content, "anthropic-ok");

let geminiUrl = "";
const geminiGateway = createHttpModelGateway({
  allowPrivateEndpoints: () => true,
  createTraceId: () => "trace-gemini",
  request: async (url) => {
    geminiUrl = url;
    return jsonResponse({ candidates: [{ content: { parts: [{ text: "gemini-ok" }] } }], usageMetadata: { totalTokenCount: 5 } });
  }
});
const geminiResult = await geminiGateway.generateText({ config: config("gemini"), prompt: "hello" });
assert.match(geminiUrl, /generateContent\?key=secret-model-key$/);
assert.equal(geminiResult.content, "gemini-ok");
assert.deepEqual(geminiResult.usage, { totalTokenCount: 5 });

const authGateway = createHttpModelGateway({
  allowPrivateEndpoints: () => true,
  createTraceId: () => "trace-auth",
  request: async () => jsonResponse({ error: { message: "bad secret-model-key", type: "invalid_api_key" } }, 401)
});
await expectGatewayError(authGateway.generateText({ config: config("openai-compatible"), prompt: "hello" }), "authentication");

const rateLimitGateway = createHttpModelGateway({
  allowPrivateEndpoints: () => true,
  createTraceId: () => "trace-rate",
  request: async () => jsonResponse({ error: { message: "slow down" } }, 429)
});
await expectGatewayError(rateLimitGateway.generateText({ config: config("openai-compatible"), prompt: "hello" }), "rate_limited");

const invalidJsonGateway = createHttpModelGateway({
  allowPrivateEndpoints: () => true,
  createTraceId: () => "trace-invalid",
  request: async () => new Response("<html>secret-model-key</html>", { status: 200, headers: { "content-type": "text/html" } })
});
await expectGatewayError(invalidJsonGateway.generateText({ config: config("gemini"), prompt: "hello" }), "invalid_response");

const emptyGateway = createHttpModelGateway({
  allowPrivateEndpoints: () => true,
  createTraceId: () => "trace-empty",
  request: async () => jsonResponse({ choices: [] })
});
await expectGatewayError(emptyGateway.generateText({ config: config("openai-compatible"), prompt: "hello" }), "invalid_response");

let timeoutCalls = 0;
const timeoutGateway = createHttpModelGateway({
  allowPrivateEndpoints: () => true,
  timeoutMs: 5,
  createTraceId: () => "trace-timeout",
  request: async (_url, init) => {
    timeoutCalls += 1;
    return await new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    });
  }
});
await expectGatewayError(timeoutGateway.generateText({ config: config("openai-compatible"), prompt: "hello" }), "timeout");
assert.equal(timeoutCalls, 1);

let rejectedRequestCalls = 0;
const securityGateway = createHttpModelGateway({
  createTraceId: () => "trace-security",
  assertEndpoint: async () => { throw new Error("private address"); },
  request: async () => {
    rejectedRequestCalls += 1;
    return jsonResponse({});
  }
});
await expectGatewayError(securityGateway.generateText({ config: config("openai-compatible", { baseUrl: "http://127.0.0.1:11434/v1" }), prompt: "hello" }), "security_rejected");
assert.equal(rejectedRequestCalls, 0);

await expectGatewayError(openAiGateway.generateText({ config: config("openai-compatible", { apiKey: "" }), prompt: "hello" }), "unconfigured");

console.log(JSON.stringify({
  ok: true,
  protocols: ["openai-compatible", "anthropic", "gemini"],
  failures: ["unconfigured", "authentication", "timeout", "rate_limited", "invalid_response", "security_rejected"],
  realOutboundCalls: 0,
  secretRedaction: true
}, null, 2));
