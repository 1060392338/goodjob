import assert from "node:assert/strict";
import {
  createLeadSourceCenterClient,
  defaultSelectedLeadSourceIds,
  markLeadSourceSelected,
  refreshLeadSourceProviders,
  removeLeadSourceSelection,
  toggleLeadSourceSelection,
  type LeadProviderStatus,
  type LeadSourceCenterState
} from "./lead-source-center";

function provider(overrides: Partial<LeadProviderStatus> = {}): LeadProviderStatus {
  return {
    id: "google_search",
    name: "Google Search",
    tier: "free",
    category: "web",
    requiresKey: false,
    capabilities: ["company_search"],
    docsUrl: "",
    keyHint: "",
    defaultBaseUrl: "",
    costNote: "免费",
    hasApiKey: false,
    ready: true,
    enabled: true,
    lastTestStatus: "untested",
    lastTestMessage: "",
    lastTestAt: "",
    usage: "",
    ...overrides
  };
}

const providers = [
  provider(),
  provider({ id: "hunter", name: "Hunter", tier: "paid", category: "email", requiresKey: true, hasApiKey: true }),
  provider({ id: "disabled", name: "Disabled", enabled: false }),
  provider({ id: "not_ready", name: "Not Ready", ready: false }),
  provider({ id: "ai_search", name: "AI Search", tier: "ai", category: "ai" })
];

assert.deepEqual(defaultSelectedLeadSourceIds(providers), ["google_search", "hunter"]);

const untouched: LeadSourceCenterState = {
  leadProviders: [],
  selectedLeadSources: ["stale"],
  leadSourceSelectionTouched: false
};
assert.deepEqual(refreshLeadSourceProviders(untouched, providers), {
  leadProviders: providers,
  selectedLeadSources: ["google_search", "hunter"],
  leadSourceSelectionTouched: false
});

const touched: LeadSourceCenterState = {
  leadProviders: [],
  selectedLeadSources: ["manual", "not_ready"],
  leadSourceSelectionTouched: true
};
assert.deepEqual(refreshLeadSourceProviders(touched, providers), {
  leadProviders: providers,
  selectedLeadSources: ["manual", "not_ready"],
  leadSourceSelectionTouched: true
});

const selected = toggleLeadSourceSelection(untouched, "hunter");
assert.deepEqual(selected.selectedLeadSources, ["stale", "hunter"]);
assert.equal(selected.leadSourceSelectionTouched, true);
const deselected = toggleLeadSourceSelection(selected, "hunter");
assert.deepEqual(deselected.selectedLeadSources, ["stale"]);
assert.equal(deselected.leadSourceSelectionTouched, true);
assert.deepEqual(markLeadSourceSelected(deselected, "hunter").selectedLeadSources, ["stale", "hunter"]);
assert.deepEqual(markLeadSourceSelected(markLeadSourceSelected(deselected, "hunter"), "hunter").selectedLeadSources, ["stale", "hunter"]);
assert.deepEqual(removeLeadSourceSelection(markLeadSourceSelected(deselected, "hunter"), "hunter").selectedLeadSources, ["stale"]);

const calls: Array<{ path: string; init?: RequestInit }> = [];
const client = createLeadSourceCenterClient(async <T>(path: string, init?: RequestInit) => {
  calls.push({ path, init });
  if (path === "/api/lead-finder/providers") return { providers } as T;
  if (path === "/api/lead-finder/source-config/test") return { ok: true, message: "连接成功", usage: "1/10", providers } as T;
  return { providers } as T;
});

assert.deepEqual((await client.loadProviders()).providers, providers);
await client.saveConfig("hunter", "secret-key");
assert.equal(calls[1]?.path, "/api/lead-finder/source-config");
assert.equal(calls[1]?.init?.method, "POST");
assert.equal(calls[1]?.init?.body, JSON.stringify({ provider: "hunter", apiKey: "secret-key", enabled: true }));

const testResult = await client.testConfig("hunter");
assert.equal(calls[2]?.path, "/api/lead-finder/source-config/test");
assert.equal(calls[2]?.init?.method, "POST");
assert.equal(calls[2]?.init?.body, JSON.stringify({ provider: "hunter" }));
assert.equal(testResult.message, "连接成功");

await client.deleteConfig("custom/provider");
assert.equal(calls[3]?.path, "/api/lead-finder/source-config/custom%2Fprovider");
assert.equal(calls[3]?.init?.method, "DELETE");

console.log(JSON.stringify({ ok: true, stateCases: 8, apiContracts: calls.length }, null, 2));
