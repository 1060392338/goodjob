import type { Application } from "express";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { convertLead, getLeadConversionPreview } from "../domain/leads/lead-conversion-service.js";
import { asyncRoute } from "../http/async-route.js";

const conversionSchema = z.object({
  customerMode: z.enum(["create", "existing"]).optional().default("create"),
  customerId: z.string().optional().default(""),
  createDeal: z.boolean().optional().default(false),
  deal: z.object({
    title: z.string().max(200).optional().default(""),
    product: z.string().max(200).optional().default(""),
    amount: z.coerce.number().nonnegative().optional(),
    quantity: z.coerce.number().int().nonnegative().optional().default(0),
    unitPrice: z.coerce.number().nonnegative().optional().default(0),
    nextAction: z.string().max(200).optional().default("")
  }).optional().default({})
});

export function registerLeadConversionRoutes(app: Application) {
  app.get("/api/leads/:id/conversion-preview", requireAuth, (req, res) => {
    const result = getLeadConversionPreview(req.user!, req.params.id);
    if (!result) {
      res.status(404).json({ message: "线索不存在、已删除或无权访问" });
      return;
    }
    res.json(result);
  });

  app.post("/api/leads/:id/convert", requireAuth, asyncRoute(async (req, res) => {
    const body = conversionSchema.parse(req.body || {});
    const result = await convertLead(req.user!, req.params.id, body);
    if (result.status === "not_found") {
      res.status(404).json({ message: "线索不存在、已删除或无权访问" });
      return;
    }
    if (result.status === "customer_not_found") {
      res.status(404).json({ message: "要关联的客户不存在或无权访问" });
      return;
    }
    res.json({ lead: result.lead, customer: result.customer, deal: result.deal, duplicate: result.duplicate });
  }));
}
