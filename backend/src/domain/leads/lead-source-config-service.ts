import type { LeadSourceDescriptor } from "../../connectors/lead-source-connector.js";
import type { CrmStore } from "../../store.js";
import { getStore } from "../../store.js";
import type { LeadSourceConfig, SessionUser } from "../../types.js";
import { getAiConfig } from "../ai/ai-config-service.js";
import { maskSecret } from "../../security/secret-vault.js";

export function getLeadSourceConfig(user: SessionUser, provider: string, store: CrmStore = getStore()) {
  return store.leadSourceConfigs.find((item) => item.provider === provider && item.ownerId === user.id);
}

export function publicLeadSourceConfig(config: LeadSourceConfig) {
  return {
    id: config.id,
    provider: config.provider,
    scope: config.scope,
    apiKey: maskSecret(config.apiKey),
    hasApiKey: Boolean(config.apiKey),
    baseUrl: config.baseUrl || "",
    enabled: config.enabled,
    lastTestAt: config.lastTestAt || "",
    lastTestStatus: config.lastTestStatus || "untested",
    lastTestMessage: config.lastTestMessage || "",
    usage: config.usageJson || "",
    updatedAt: config.updatedAt
  };
}

export function providerStatusFor(user: SessionUser, provider: LeadSourceDescriptor, store: CrmStore = getStore()) {
  const config = getLeadSourceConfig(user, provider.id, store);
  const hasKey = !provider.requiresKey || Boolean(config?.apiKey);
  const enabled = provider.requiresKey ? Boolean(config?.enabled && config?.apiKey) : config ? config.enabled : true;
  return {
    ...provider,
    hasApiKey: Boolean(config?.apiKey),
    ready: hasKey,
    enabled,
    lastTestStatus: config?.lastTestStatus || (provider.requiresKey ? "untested" : "passed"),
    lastTestMessage: config?.lastTestMessage || "",
    lastTestAt: config?.lastTestAt || "",
    usage: config?.usageJson || ""
  };
}

export function aiSearchStatus(user: SessionUser, store: CrmStore = getStore()) {
  const config = getAiConfig(user, "leadFinder", store);
  const ready = Boolean(config?.enabled && config?.apiKey && config?.useLeadFinder);
  return {
    id: "ai_search",
    name: "AI 搜索",
    tier: "ai" as const,
    category: "ai" as const,
    requiresKey: false,
    capabilities: ["ai", "company"],
    docsUrl: "",
    keyHint: "使用「AI 模型配置」中已启用并勾选自动获客的模型，无需在此另填 Key。",
    defaultBaseUrl: "",
    costNote: "调用你配置的 AI 模型直接生成候选公司，结果需人工核实。",
    hasApiKey: ready,
    ready,
    enabled: ready,
    lastTestStatus: ready ? "passed" : "untested",
    lastTestMessage: ready ? `当前模型：${config?.model || "已配置"}` : "请先在「AI 模型配置」启用模型并勾选“自动获客”",
    lastTestAt: config?.lastTestAt || "",
    usage: ""
  };
}

export function allProviderStatuses(user: SessionUser, providers: LeadSourceDescriptor[], store: CrmStore = getStore()) {
  return [aiSearchStatus(user, store), ...providers.map((provider) => providerStatusFor(user, provider, store))];
}
