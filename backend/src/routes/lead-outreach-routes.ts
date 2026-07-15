import type { Application } from "express";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import { recordSocialTouch, sendLeadEmail } from "../domain/leads/lead-outreach-service.js";
import type { OutboundEmailGateway } from "../gateways/outbound-email-gateway.js";
import { asyncRoute } from "../http/async-route.js";

const socialTouchSchema = z.object({
  channel: z.enum(["call", "wechat", "whatsapp", "linkedin"]),
  message: z.string().min(1).max(1200),
  nextFollowAt: z.string().optional().default("")
});

const leadEmailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(160),
  body: z.string().min(10).max(3000),
  nextFollowAt: z.string().optional().default("")
});

function idempotencyKey(value: string | undefined) {
  if (!value) return undefined;
  return z.string().max(200).parse(value);
}

export function registerLeadOutreachRoutes(app: Application, dependencies: { emailGateway: OutboundEmailGateway }) {
  app.post("/api/leads/:id/social-touch", requireAuth, asyncRoute(async (req, res) => {
    const body = socialTouchSchema.parse(req.body);
    const result = await recordSocialTouch(req.user!, req.params.id, body, idempotencyKey(req.get("Idempotency-Key")));
    if (result.status === "not_found") {
      res.status(404).json({ message: "线索不存在、已删除或无权访问" });
      return;
    }
    if (result.status === "conflict" || result.status === "unavailable") {
      res.status(409).json({ message: result.message });
      return;
    }
    res.json({ activity: result.activity, lead: result.lead, ...(result.duplicate ? { duplicate: true } : {}) });
  }));

  app.post("/api/leads/:id/send-email", requireAuth, asyncRoute(async (req, res) => {
    const body = leadEmailSchema.parse(req.body);
    const result = await sendLeadEmail(
      req.user!,
      req.params.id,
      body,
      dependencies.emailGateway,
      idempotencyKey(req.get("Idempotency-Key"))
    );
    if (result.status === "account_not_found") {
      res.status(404).json({ message: "账号不存在" });
      return;
    }
    if (result.status === "not_found") {
      res.status(404).json({ message: "线索不存在、已删除或无权访问" });
      return;
    }
    if (result.status === "conflict" || result.status === "unavailable") {
      res.status(409).json({ message: result.message });
      return;
    }
    if (result.status === "send_failed") {
      res.status(400).json({ message: result.message });
      return;
    }
    res.json(result.response);
  }));
}
