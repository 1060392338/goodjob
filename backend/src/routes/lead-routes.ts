import type { Application } from "express";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import {
  addLeadActivity,
  getVisibleLeadDetails,
  leadSourceTypes,
  listVisibleLeads,
  moveLeadToTrash,
  permanentlyDeleteLead,
  persistLeadFromSource,
  restoreLead,
  updateLead
} from "../domain/leads/lead-service.js";
import { asyncRoute } from "../http/async-route.js";

const leadWritableSchema = z.object({
  company: z.string().min(1),
  contact: z.string().optional().default(""),
  country: z.string().optional().default(""),
  email: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  wechat: z.string().optional().default(""),
  source: z.string().optional().default("手动录入"),
  intent: z.enum(["高", "中", "低"]).optional().default("中"),
  stage: z.string().optional().default("新线索"),
  estimatedAmount: z.number().nonnegative().optional().default(0),
  nextFollowAt: z.string().optional().default(""),
  remark: z.string().optional().default(""),
  sourceType: z.enum(leadSourceTypes).optional().default("outbound"),
  sourceChannel: z.string().max(80).optional().default("manual"),
  sourceCampaign: z.string().max(120).optional().default(""),
  externalId: z.string().max(180).optional().default(""),
  sourceUrl: z.string().max(500).optional().default("")
});

const updateLeadSchema = leadWritableSchema.partial().extend({
  status: z.enum(["new", "following", "converted", "invalid"]).optional()
});

const trashLeadSchema = z.object({ reason: z.string().optional().default("") });

const leadActivitySchema = z.object({
  type: z.enum(["call", "wechat", "whatsapp", "linkedin", "email", "meeting", "note"]).default("note"),
  content: z.string().min(1),
  nextFollowAt: z.string().optional().default("")
});

export function registerLeadRoutes(app: Application) {
  app.get("/api/leads", requireAuth, (req, res) => {
    res.json({ leads: listVisibleLeads(req.user!, req.query.trash === "true") });
  });

  app.get("/api/leads/:id", requireAuth, (req, res) => {
    const result = getVisibleLeadDetails(req.user!, req.params.id);
    if (!result) {
      res.status(404).json({ message: "线索不存在或无权访问" });
      return;
    }
    res.json(result);
  });

  app.post("/api/leads", requireAuth, asyncRoute(async (req, res) => {
    const body = leadWritableSchema.parse(req.body);
    const result = await persistLeadFromSource(req.user!, body);
    res.json(result);
  }));

  app.post("/api/leads/ingest", requireAuth, asyncRoute(async (req, res) => {
    const schema = leadWritableSchema.extend({
      occurredAt: z.string().datetime().optional(),
      rawPayload: z.unknown().optional()
    });
    const body = schema.parse(req.body);
    const result = await persistLeadFromSource(req.user!, body);
    res.status(result.duplicate ? 200 : 201).json(result);
  }));

  app.patch("/api/leads/:id", requireAuth, asyncRoute(async (req, res) => {
    const body = updateLeadSchema.parse(req.body);
    const lead = await updateLead(req.user!, req.params.id, body);
    if (!lead) {
      res.status(404).json({ message: "线索不存在或无权访问" });
      return;
    }
    res.json({ lead });
  }));

  app.delete("/api/leads/:id", requireAuth, asyncRoute(async (req, res) => {
    const body = trashLeadSchema.parse(req.body || {});
    const result = await moveLeadToTrash(req.user!, req.params.id, body.reason);
    if (result.status === "not_found") {
      res.status(404).json({ message: "线索不存在或无权访问" });
      return;
    }
    if (result.status === "converted") {
      res.status(400).json({ message: "已转客户的线索必须保留来源追溯，不能移入垃圾箱" });
      return;
    }
    if (result.status === "already_deleted") {
      res.status(400).json({ message: "线索已在垃圾箱中" });
      return;
    }
    res.json({ lead: result.lead });
  }));

  app.post("/api/leads/:id/restore", requireAuth, asyncRoute(async (req, res) => {
    const result = await restoreLead(req.user!, req.params.id);
    if (result.status === "not_found") {
      res.status(404).json({ message: "线索不存在或无权访问" });
      return;
    }
    if (result.status === "not_deleted") {
      res.status(400).json({ message: "线索不在垃圾箱中" });
      return;
    }
    res.json({ lead: result.lead });
  }));

  app.delete("/api/leads/:id/permanent", requireAuth, asyncRoute(async (req, res) => {
    const result = await permanentlyDeleteLead(req.user!, req.params.id);
    if (result.status === "not_found") {
      res.status(404).json({ message: "线索不存在或无权访问" });
      return;
    }
    if (result.status === "not_deleted") {
      res.status(400).json({ message: "只有垃圾箱中的线索可以永久删除" });
      return;
    }
    if (result.status === "converted") {
      res.status(400).json({ message: "已转客户的线索必须保留来源追溯，不能永久删除" });
      return;
    }
    res.json({ ok: true, id: result.id, sourceEventsDeleted: result.sourceEventsDeleted });
  }));

  app.post("/api/leads/:id/activities", requireAuth, asyncRoute(async (req, res) => {
    const body = leadActivitySchema.parse(req.body);
    const result = await addLeadActivity(req.user!, req.params.id, body);
    if (!result) {
      res.status(404).json({ message: "线索不存在或无权访问" });
      return;
    }
    res.json(result);
  }));
}