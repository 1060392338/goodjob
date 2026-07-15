import { canSeeOwner } from "../../auth.js";
import { customerWithPipeline } from "../customers/customer-service.js";
import { createDealEvent } from "../deals/deal-service.js";
import { getStore } from "../../store.js";
import type { Customer, Deal, Lead, SessionUser } from "../../types.js";
import { findCustomerMatches } from "./lead-service.js";

export interface ConvertLeadInput {
  customerMode: "create" | "existing";
  customerId: string;
  createDeal: boolean;
  deal: {
    title: string;
    product: string;
    amount?: number;
    quantity: number;
    unitPrice: number;
    nextAction: string;
  };
}

function visibleActiveLead(user: SessionUser, leadId: string) {
  const lead = getStore().leads.find((item) => item.id === leadId);
  if (!lead || !canSeeOwner(user, lead.ownerId, lead.teamId) || lead.deletedAt) return null;
  return lead;
}

export function getLeadConversionPreview(user: SessionUser, leadId: string) {
  const lead = visibleActiveLead(user, leadId);
  if (!lead) return null;
  return { lead, customerMatches: findCustomerMatches(user, lead) };
}

export type ConvertLeadResult =
  | { status: "not_found" }
  | { status: "customer_not_found" }
  | { status: "ok"; lead: Lead; customer: ReturnType<typeof customerWithPipeline> | null; deal?: Deal; duplicate: boolean };

export async function convertLead(user: SessionUser, leadId: string, input: ConvertLeadInput): Promise<ConvertLeadResult> {
  const store = getStore();
  const lead = visibleActiveLead(user, leadId);
  if (!lead) return { status: "not_found" };
  if (lead.convertedCustomerId) {
    const customer = store.customers.find((item) => item.id === lead.convertedCustomerId);
    const deal = lead.convertedDealId ? store.deals.find((item) => item.id === lead.convertedDealId) : undefined;
    return { status: "ok", lead, customer: customer ? customerWithPipeline(customer) : null, deal, duplicate: true };
  }

  let customer: Customer | undefined;
  if (input.customerMode === "existing") {
    customer = store.customers.find((item) => item.id === input.customerId);
    if (!customer || !canSeeOwner(user, customer.ownerId, customer.teamId)) return { status: "customer_not_found" };
  }

  const leadSnapshot = { ...lead };
  const customersSnapshot = [...store.customers];
  const dealsSnapshot = [...store.deals];
  const dealEventsSnapshot = [...store.dealEvents];
  const leadActivitiesSnapshot = [...store.leadActivities];
  const now = new Date().toISOString();

  if (!customer) {
    customer = {
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      company: lead.company,
      country: lead.country || "未知",
      contact: lead.contact || "待维护",
      ownerId: lead.ownerId,
      teamId: lead.teamId,
      stage: "询盘",
      amount: 0,
      health: 72,
      nextReminder: lead.nextFollowAt || "明天 10:00",
      wecomBound: false,
      billingName: lead.company,
      billingAddress: "",
      documentContact: lead.email ? `${lead.contact || "待维护"} / ${lead.email}` : lead.contact || "",
      defaultPortDischarge: "",
      defaultIncoterm: "",
      defaultPaymentTerm: ""
    };
    store.customers = [customer, ...store.customers];
  }

  let deal: Deal | undefined;
  if (input.createDeal) {
    const nextActionAt = /^\d{4}-\d{2}-\d{2}/.test(lead.nextFollowAt)
      ? lead.nextFollowAt.slice(0, 10)
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    deal = {
      id: `d_lead_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      customerId: customer.id,
      title: input.deal.title.trim() || `${lead.company} 采购需求`,
      stage: "询盘",
      product: input.deal.product.trim(),
      quantity: input.deal.quantity,
      unitPrice: input.deal.unitPrice,
      amount: typeof input.deal.amount === "number"
        ? input.deal.amount
        : (lead.estimatedAmount || input.deal.quantity * input.deal.unitPrice),
      currency: "USD",
      amountType: "estimate",
      ownerId: customer.ownerId,
      teamId: customer.teamId,
      nextAction: input.deal.nextAction.trim() || "确认产品、数量与报价要求",
      nextActionAt,
      expectedCloseAt: "",
      stageChangedAt: now
    };
    store.deals = [deal, ...store.deals];
    createDealEvent({
      dealId: deal.id,
      type: "created",
      content: `由线索 ${lead.company} 确认入客户并创建商机`,
      operatorId: user.id,
      toStage: "询盘",
      nextAction: deal.nextAction,
      nextActionAt: deal.nextActionAt,
      createdAt: now
    });
  }

  lead.status = "converted";
  lead.stage = "已转化";
  lead.convertedCustomerId = customer.id;
  lead.convertedDealId = deal?.id || "";
  lead.lastActivityAt = "刚刚";
  store.leadActivities = [{
    id: `la_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    leadId: lead.id,
    type: "system",
    content: deal
      ? `确认并入库：关联客户 ${customer.company}，创建商机 ${deal.title}`
      : `确认并入库：关联客户 ${customer.company}`,
    operatorId: user.id,
    nextFollowAt: "",
    createdAt: now
  }, ...store.leadActivities];

  try {
    await store.persist();
  } catch (error) {
    Object.assign(lead, leadSnapshot);
    store.customers = customersSnapshot;
    store.deals = dealsSnapshot;
    store.dealEvents = dealEventsSnapshot;
    store.leadActivities = leadActivitiesSnapshot;
    throw error;
  }

  return { status: "ok", lead, customer: customerWithPipeline(customer), deal, duplicate: false };
}
