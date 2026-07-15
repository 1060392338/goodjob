import type { Application } from "express";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { getAiConfig, getAiConfigs, publicAiConfig, testAiConfig } from "../domain/ai/ai-config-service.js";
import type { ModelGateway } from "../gateways/model-gateway.js";
import { asyncRoute } from "../http/async-route.js";
import { assertPublicHttpUrl } from "../outbound-security.js";
import { getStore } from "../store.js";
import type { AiModelConfig } from "../types.js";

const aiConfigSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  provider: z.string().min(1).max(40).default("openai"),
  protocol: z.enum(["openai-compatible", "anthropic", "gemini"]).default("openai-compatible"),
  name: z.string().min(1).default("AI业务模型配置"),
  baseUrl: z.string().url(),
  model: z.string().min(1),
  apiKey: z.string().optional().default(""),
  enabled: z.boolean().default(false),
  temperature: z.number().min(0).max(2).default(0.1),
  useLeadFinder: z.boolean().default(true),
  useWebsiteParse: z.boolean().default(true),
  useScoring: z.boolean().default(true),
  useEmailDraft: z.boolean().default(true),
  useExam: z.boolean().default(false)
});

export interface AiConfigRouteDependencies {
  modelGateway: ModelGateway;
  assertPublicEndpoint?: (url: string) => Promise<unknown>;
  allowPrivateEndpoints?: () => boolean;
  now?: () => Date;
}

export function registerAiConfigRoutes(app: Application, dependencies: AiConfigRouteDependencies) {
  const assertPublicEndpoint = dependencies.assertPublicEndpoint || assertPublicHttpUrl;
  const allowPrivateEndpoints = dependencies.allowPrivateEndpoints || (() => process.env.ALLOW_PRIVATE_AI_ENDPOINTS === "true");
  const now = dependencies.now || (() => new Date());

  app.get("/api/tools/ai-config", requireAuth, (req, res) => {
    const configs = getAiConfigs(req.user!);
    const config = getAiConfig(req.user!);
    res.json({ config: config ? publicAiConfig(config) : null, configs: configs.map(publicAiConfig) });
  });

  app.post("/api/tools/ai-config", requireAuth, asyncRoute(async (req, res) => {
    const body = aiConfigSchema.parse(req.body);
    if (!allowPrivateEndpoints()) await assertPublicEndpoint(body.baseUrl);

    const store = getStore();
    const idCollision = body.id ? store.aiModelConfigs.find((item) => item.id === body.id) : undefined;
    if (idCollision && idCollision.ownerId !== req.user!.id) {
      res.status(404).json({ message: "配置不存在或无权修改" });
      return;
    }
    const existing = idCollision?.ownerId === req.user!.id ? idCollision : undefined;
    const apiKey = body.apiKey && !body.apiKey.includes("****") ? body.apiKey : existing?.apiKey || "";
    if (body.enabled && !apiKey) {
      res.status(400).json({ message: "启用配置前必须填写 API Key" });
      return;
    }

    const timestamp = now().toISOString();
    const config: AiModelConfig = {
      id: existing?.id || body.id || `ai_${req.user!.id}_${now().getTime()}`,
      provider: body.provider,
      protocol: body.protocol,
      name: body.name,
      baseUrl: body.baseUrl.replace(/\/+$/, ""),
      model: body.model,
      apiKey,
      enabled: body.enabled,
      temperature: body.temperature,
      useLeadFinder: body.useLeadFinder,
      useWebsiteParse: body.useWebsiteParse,
      useScoring: body.useScoring,
      useEmailDraft: body.useEmailDraft,
      useExam: body.useExam,
      lastTestAt: existing?.lastTestAt,
      lastTestStatus: existing?.lastTestStatus || "untested",
      lastTestMessage: existing?.lastTestMessage || "",
      ownerId: req.user!.id,
      teamId: req.user!.teamId,
      updatedAt: timestamp
    };
    if (existing) Object.assign(existing, config);
    else store.aiModelConfigs.unshift(config);
    await store.persist();
    res.json({ config: publicAiConfig(config), configs: getAiConfigs(req.user!).map(publicAiConfig) });
  }));

  app.delete("/api/tools/ai-config/:id", requireAuth, asyncRoute(async (req, res) => {
    const store = getStore();
    const index = store.aiModelConfigs.findIndex((item) => item.id === req.params.id && item.ownerId === req.user!.id);
    if (index < 0) {
      res.status(404).json({ message: "配置不存在或无权删除" });
      return;
    }
    store.aiModelConfigs.splice(index, 1);
    await store.persist();
    const config = getAiConfig(req.user!);
    res.json({ config: config ? publicAiConfig(config) : null, configs: getAiConfigs(req.user!).map(publicAiConfig) });
  }));

  app.post("/api/tools/ai-config/test", requireAuth, asyncRoute(async (req, res) => {
    const body = z.object({ id: z.string().min(1).max(64).optional() }).parse(req.body || {});
    const config = body.id
      ? getStore().aiModelConfigs.find((item) => item.id === body.id && item.ownerId === req.user!.id) || null
      : getAiConfig(req.user!);
    if (!config || !config.baseUrl || !config.model) {
      res.status(400).json({ message: "请先保存模型地址和模型名称" });
      return;
    }
    if (!config.apiKey) {
      res.status(400).json({ message: "请先填写 API Key；系统不会在页面明文回显密钥" });
      return;
    }

    const result = await testAiConfig(config, dependencies.modelGateway);
    const timestamp = now().toISOString();
    config.lastTestAt = timestamp;
    config.lastTestStatus = result.ok ? "passed" : "failed";
    config.lastTestMessage = result.message;
    config.updatedAt = timestamp;
    await getStore().persist();
    res.json({ ok: result.ok, message: result.message, config: publicAiConfig(config), configs: getAiConfigs(req.user!).map(publicAiConfig) });
  }));
}
