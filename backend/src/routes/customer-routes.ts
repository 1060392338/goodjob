import type { Application } from "express";
import { z } from "zod";
import { requireAuth } from "../auth.js";
import {
  addCustomerActivity,
  createCustomer,
  deleteVisibleCustomers,
  listVisibleCustomers,
  updateCustomer
} from "../domain/customers/customer-service.js";
import { asyncRoute } from "../http/async-route.js";

const createCustomerSchema = z.object({
  company: z.string().min(1),
  country: z.string().min(1).default("未知"),
  contact: z.string().min(1).default("待维护"),
  stage: z.string().min(1).default("询盘"),
  amount: z.number().int().nonnegative().default(0),
  billingName: z.string().optional().default(""),
  billingAddress: z.string().optional().default(""),
  documentContact: z.string().optional().default(""),
  defaultPortDischarge: z.string().optional().default(""),
  defaultIncoterm: z.string().optional().default(""),
  defaultPaymentTerm: z.string().optional().default("")
});

const updateCustomerSchema = z.object({
  company: z.string().min(1).optional(),
  country: z.string().min(1).optional(),
  contact: z.string().min(1).optional(),
  stage: z.string().min(1).optional(),
  amount: z.number().int().nonnegative().optional(),
  nextReminder: z.string().min(1).optional(),
  wecomBound: z.boolean().optional(),
  billingName: z.string().optional(),
  billingAddress: z.string().optional(),
  documentContact: z.string().optional(),
  defaultPortDischarge: z.string().optional(),
  defaultIncoterm: z.string().optional(),
  defaultPaymentTerm: z.string().optional()
});

const bulkDeleteSchema = z.object({ ids: z.array(z.string()).min(1).max(200) });

const customerActivitySchema = z.object({
  type: z.enum(["call", "email", "whatsapp", "wechat", "meeting", "note"]),
  content: z.string().trim().min(1).max(2000),
  nextReminder: z.string().trim().max(100).optional().default("")
});

export function registerCustomerRoutes(app: Application) {
  app.get("/api/customers", requireAuth, (req, res) => {
    res.json({ customers: listVisibleCustomers(req.user!) });
  });

  app.post("/api/customers", requireAuth, asyncRoute(async (req, res) => {
    const body = createCustomerSchema.parse(req.body);
    const customer = await createCustomer(req.user!, body);
    res.json({ customer });
  }));

  app.patch("/api/customers/:id", requireAuth, asyncRoute(async (req, res) => {
    const body = updateCustomerSchema.parse(req.body);
    const customer = await updateCustomer(req.user!, req.params.id, body);
    if (!customer) {
      res.status(404).json({ message: "客户不存在" });
      return;
    }
    res.json({ customer });
  }));

  app.post("/api/customers/bulk-delete", requireAuth, asyncRoute(async (req, res) => {
    const body = bulkDeleteSchema.parse(req.body);
    const result = await deleteVisibleCustomers(req.user!, body.ids);
    if (!result) {
      res.status(404).json({ message: "未找到可删除的客户" });
      return;
    }
    res.json(result);
  }));

  app.post("/api/customers/:id/activities", requireAuth, asyncRoute(async (req, res) => {
    const body = customerActivitySchema.parse(req.body);
    const result = await addCustomerActivity(req.user!, req.params.id, body);
    if (!result) {
      res.status(404).json({ message: "客户不存在或无权访问" });
      return;
    }
    res.json(result);
  }));
}
