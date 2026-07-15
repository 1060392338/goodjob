import type { Application } from "express";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { LeadSourceConnectorError, type LeadSourceConnector } from "../connectors/lead-source-connector.js";
import { allProviderStatuses, getLeadSourceConfig, publicLeadSourceConfig } from "../domain/leads/lead-source-config-service.js";
import { asyncRoute } from "../http/async-route.js";
import { assertPublicHttpUrl } from "../outbound-security.js";
import { getStore } from "../store.js";
import type { LeadSourceConfig } from "../types.js";

const sourceConfigSchema = z.object({
  provider: z.string().min(1).max(40),
  apiKey: z.string().max(400).optional().default(""),
  baseUrl: z.string().max(255).optional().default(""),
  enabled: z.boolean().optional().default(false)
});

export interface LeadSourceConfigRouteDependencies {
  connector: LeadSourceConnector;
  assertPublicEndpoint?: (url: string) => Promise<unknown>;
  now?: () => Date;
}

export function registerLeadSourceConfigRoutes(app: Application, dependencies: LeadSourceConfigRouteDependencies) {
  const assertPublicEndpoint = dependencies.assertPublicEndpoint || assertPublicHttpUrl;
  const now = dependencies.now || (() => new Date());
  const providerDescriptors = () => dependencies.connector.listProviders();
  const statuses = (user: NonNullable<Express.Request["user"]>) => allProviderStatuses(user, providerDescriptors());

  app.get("/api/lead-finder/providers", requireAuth, (req, res) => {
    res.json({ providers: statuses(req.user!) });
  });

  app.post("/api/lead-finder/source-config", requireAuth, asyncRoute(async (req, res) => {
    const body = sourceConfigSchema.parse(req.body);
    const provider = dependencies.connector.findProvider(body.provider);
    if (!provider) {
      res.status(404).json({ message: "未知数据源" });
      return;
    }
    if (body.baseUrl) await assertPublicEndpoint(body.baseUrl);
    const store = getStore();
    const existing = getLeadSourceConfig(req.user!, body.provider, store);
    const apiKey = body.apiKey && !body.apiKey.includes("****") ? body.apiKey : existing?.apiKey || "";
    if (provider.requiresKey && body.enabled && !apiKey) {
      res.status(400).json({ message: "启用前请先填写该数据源的 API Key" });
      return;
    }
    const timestamp = now().toISOString();
    const config: LeadSourceConfig = {
      id: existing?.id || `ls_${provider.id}_${req.user!.id}_${now().getTime()}`,
      provider: provider.id,
      scope: "personal",
      apiKey,
      baseUrl: body.baseUrl || existing?.baseUrl || "",
      enabled: body.enabled,
      lastTestAt: existing?.lastTestAt,
      lastTestStatus: existing?.lastTestStatus || "untested",
      lastTestMessage: existing?.lastTestMessage || "",
      usageJson: existing?.usageJson,
      ownerId: req.user!.id,
      teamId: req.user!.teamId,
      updatedAt: timestamp
    };
    if (existing) Object.assign(existing, config);
    else store.leadSourceConfigs.unshift(config);
    await store.persist();
    res.json({ config: publicLeadSourceConfig(config), providers: statuses(req.user!) });
  }));

  app.post("/api/lead-finder/source-config/test", requireAuth, asyncRoute(async (req, res) => {
    const body = z.object({ provider: z.string().min(1).max(40) }).parse(req.body);
    const provider = dependencies.connector.findProvider(body.provider);
    if (!provider) {
      res.status(404).json({ message: "未知数据源" });
      return;
    }
    const store = getStore();
    const config = getLeadSourceConfig(req.user!, provider.id, store);
    if (provider.requiresKey && !config?.apiKey) {
      res.status(400).json({ message: "请先保存该数据源的 API Key，再测试连接" });
      return;
    }
    let result: { ok: boolean; message: string; usage?: string };
    try {
      const connected = await dependencies.connector.testConnection({
        provider: provider.id,
        credential: { apiKey: config?.apiKey || "", baseUrl: config?.baseUrl }
      });
      result = connected;
    } catch (error) {
      result = {
        ok: false,
        message: error instanceof LeadSourceConnectorError ? error.message : "连接异常：数据源连接失败"
      };
    }
    if (config) {
      const timestamp = now().toISOString();
      config.lastTestAt = timestamp;
      config.lastTestStatus = result.ok ? "passed" : "failed";
      config.lastTestMessage = result.message;
      if (result.usage) config.usageJson = result.usage;
      config.updatedAt = timestamp;
      await store.persist();
    }
    res.json({ ok: result.ok, message: result.message, usage: result.usage || "", providers: statuses(req.user!) });
  }));

  app.delete("/api/lead-finder/source-config/:provider", requireAuth, asyncRoute(async (req, res) => {
    const store = getStore();
    const index = store.leadSourceConfigs.findIndex((item) => item.provider === req.params.provider && item.ownerId === req.user!.id);
    if (index < 0) {
      res.status(404).json({ message: "配置不存在或无权删除" });
      return;
    }
    store.leadSourceConfigs.splice(index, 1);
    await store.persist();
    res.json({ providers: statuses(req.user!) });
  }));
}
