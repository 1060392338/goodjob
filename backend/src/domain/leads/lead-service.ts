import { canSeeOwner } from "../../auth.js";
import { getStore } from "../../store.js";
import type {
  Lead,
  LeadActivity,
  LeadActivityType,
  LeadSourceEvent,
  LeadSourceType,
  LeadStatus,
  SessionUser
} from "../../types.js";

export const leadSourceTypes = ["outbound", "inbound", "offline", "referral", "import"] as const;

export interface LeadWritableInput {
  company: string;
  contact: string;
  country: string;
  email: string;
  phone: string;
  wechat: string;
  source: string;
  intent: "高" | "中" | "低";
  stage: string;
  estimatedAmount: number;
  nextFollowAt: string;
  remark: string;
  sourceType: LeadSourceType;
  sourceChannel: string;
  sourceCampaign: string;
  externalId: string;
  sourceUrl: string;
}

export interface LeadIntake extends LeadWritableInput {
  occurredAt?: string;
  rawPayload?: unknown;
}

export type UpdateLeadInput = Partial<LeadWritableInput> & {
  status?: LeadStatus;
};

export interface AddLeadActivityInput {
  type: Exclude<LeadActivityType, "stage" | "system">;
  content: string;
  nextFollowAt: string;
}

export function createLeadFromSource(user: SessionUser, input: LeadIntake) {
  const store = getStore();
  const sourceChannel = input.sourceChannel.trim() || "manual";
  const externalId = input.externalId.trim();
  if (externalId) {
    const priorEvent = store.leadSourceEvents.find((event) =>
      event.ownerId === user.id && event.channel === sourceChannel && event.externalId === externalId
    );
    const priorLead = priorEvent ? store.leads.find((lead) => lead.id === priorEvent.leadId) : undefined;
    if (priorEvent && priorLead) return { lead: priorLead, sourceEvent: priorEvent, duplicate: true };
  }

  const receivedAt = new Date().toISOString();
  const uniquePart = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const lead: Lead = {
    id: `lead_${uniquePart}`,
    company: input.company,
    contact: input.contact,
    country: input.country,
    email: input.email,
    phone: input.phone,
    wechat: input.wechat,
    source: input.source,
    sourceType: input.sourceType,
    sourceChannel,
    sourceCampaign: input.sourceCampaign,
    externalId,
    sourceUrl: input.sourceUrl,
    intent: input.intent,
    stage: input.stage,
    status: "new",
    ownerId: user.id,
    teamId: user.teamId,
    estimatedAmount: input.estimatedAmount,
    nextFollowAt: input.nextFollowAt,
    lastActivityAt: "刚刚",
    remark: input.remark,
    convertedCustomerId: "",
    convertedDealId: "",
    createdAt: receivedAt
  };
  const sourceEvent: LeadSourceEvent = {
    id: `lse_${uniquePart}`,
    leadId: lead.id,
    sourceType: input.sourceType,
    channel: sourceChannel,
    campaign: input.sourceCampaign,
    externalId: externalId || lead.id,
    sourceUrl: input.sourceUrl,
    occurredAt: input.occurredAt || receivedAt,
    receivedAt,
    rawPayload: JSON.stringify(input.rawPayload ?? input),
    ownerId: user.id,
    teamId: user.teamId
  };
  store.leads.unshift(lead);
  store.leadSourceEvents.unshift(sourceEvent);
  store.leadActivities.unshift({
    id: `la_${uniquePart}`,
    leadId: lead.id,
    type: "system",
    content: `线索创建（来源：${lead.source} / ${sourceChannel}）`,
    operatorId: user.id,
    nextFollowAt: lead.nextFollowAt,
    createdAt: receivedAt
  });
  return { lead, sourceEvent, duplicate: false };
}

export async function persistLeadFromSource(user: SessionUser, input: LeadIntake) {
  const result = createLeadFromSource(user, input);
  await getStore().persist();
  return result;
}

export function listVisibleLeads(user: SessionUser, trash: boolean) {
  return getStore().leads.filter((lead) =>
    canSeeOwner(user, lead.ownerId, lead.teamId)
    && (trash ? Boolean(lead.deletedAt) : !lead.deletedAt)
  );
}

export function getVisibleLeadDetails(user: SessionUser, leadId: string) {
  const store = getStore();
  const lead = store.leads.find((item) => item.id === leadId);
  if (!lead || !canSeeOwner(user, lead.ownerId, lead.teamId)) return null;
  const activities = store.leadActivities
    .filter((activity) => activity.leadId === lead.id)
    .sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1));
  const sourceEvents = store.leadSourceEvents
    .filter((event) => event.leadId === lead.id && canSeeOwner(user, event.ownerId, event.teamId))
    .sort((left, right) => (left.receivedAt < right.receivedAt ? 1 : -1));
  return { lead, activities, sourceEvents };
}

export async function updateLead(user: SessionUser, leadId: string, input: UpdateLeadInput) {
  const store = getStore();
  const lead = store.leads.find((item) => item.id === leadId);
  if (!lead || !canSeeOwner(user, lead.ownerId, lead.teamId)) return null;
  const previousStage = lead.stage;
  Object.assign(lead, input);
  lead.lastActivityAt = "刚刚";
  if (input.stage && input.stage !== previousStage) {
    store.leadActivities.unshift({
      id: `la_${Date.now()}`,
      leadId: lead.id,
      type: "stage",
      content: `阶段变更：${previousStage} → ${input.stage}`,
      operatorId: user.id,
      nextFollowAt: "",
      createdAt: new Date().toISOString()
    });
  }
  await store.persist();
  return lead;
}

export type TrashLeadResult =
  | { status: "not_found" }
  | { status: "converted" }
  | { status: "already_deleted" }
  | { status: "ok"; lead: Lead };

export async function moveLeadToTrash(user: SessionUser, leadId: string, reason: string): Promise<TrashLeadResult> {
  const store = getStore();
  const lead = store.leads.find((item) => item.id === leadId);
  if (!lead || !canSeeOwner(user, lead.ownerId, lead.teamId)) return { status: "not_found" };
  if (lead.convertedCustomerId) return { status: "converted" };
  if (lead.deletedAt) return { status: "already_deleted" };

  const now = new Date().toISOString();
  lead.statusBeforeDelete = lead.status;
  lead.deletedAt = now;
  lead.deletedReason = reason || "暂时无效或不适合继续跟进";
  lead.deletedBy = user.id;
  lead.purgeAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  lead.status = "invalid";
  lead.lastActivityAt = "刚刚";
  store.leadActivities.unshift({
    id: `la_${Date.now()}`,
    leadId: lead.id,
    type: "system",
    content: `移入垃圾箱：${lead.deletedReason}`,
    operatorId: user.id,
    nextFollowAt: "",
    createdAt: now
  });
  await store.persist();
  return { status: "ok", lead };
}

export type RestoreLeadResult =
  | { status: "not_found" }
  | { status: "not_deleted" }
  | { status: "ok"; lead: Lead };

export async function restoreLead(user: SessionUser, leadId: string): Promise<RestoreLeadResult> {
  const store = getStore();
  const lead = store.leads.find((item) => item.id === leadId);
  if (!lead || !canSeeOwner(user, lead.ownerId, lead.teamId)) return { status: "not_found" };
  if (!lead.deletedAt) return { status: "not_deleted" };

  const now = new Date().toISOString();
  lead.deletedAt = "";
  lead.deletedReason = "";
  lead.deletedBy = "";
  lead.purgeAt = "";
  lead.status = lead.statusBeforeDelete || "following";
  lead.statusBeforeDelete = undefined;
  lead.lastActivityAt = "刚刚";
  store.leadActivities.unshift({
    id: `la_${Date.now()}`,
    leadId: lead.id,
    type: "system",
    content: "从垃圾箱恢复线索",
    operatorId: user.id,
    nextFollowAt: "",
    createdAt: now
  });
  await store.persist();
  return { status: "ok", lead };
}

export type PermanentDeleteLeadResult =
  | { status: "not_found" }
  | { status: "not_deleted" }
  | { status: "converted" }
  | { status: "ok"; id: string; sourceEventsDeleted: number };

export async function permanentlyDeleteLead(user: SessionUser, leadId: string): Promise<PermanentDeleteLeadResult> {
  const store = getStore();
  const lead = store.leads.find((item) => item.id === leadId);
  if (!lead || !canSeeOwner(user, lead.ownerId, lead.teamId)) return { status: "not_found" };
  if (!lead.deletedAt) return { status: "not_deleted" };
  if (lead.convertedCustomerId) return { status: "converted" };

  const sourceEventsDeleted = store.leadSourceEvents.filter((item) => item.leadId === lead.id).length;
  store.leads = store.leads.filter((item) => item.id !== lead.id);
  store.leadActivities = store.leadActivities.filter((item) => item.leadId !== lead.id);
  store.leadSourceEvents = store.leadSourceEvents.filter((item) => item.leadId !== lead.id);
  await store.persist();
  return { status: "ok", id: lead.id, sourceEventsDeleted };
}

export async function addLeadActivity(user: SessionUser, leadId: string, input: AddLeadActivityInput) {
  const store = getStore();
  const lead = store.leads.find((item) => item.id === leadId);
  if (!lead || !canSeeOwner(user, lead.ownerId, lead.teamId)) return null;
  const now = new Date().toISOString();
  const activity: LeadActivity = {
    id: `la_${Date.now()}`,
    leadId: lead.id,
    type: input.type,
    content: input.content,
    operatorId: user.id,
    nextFollowAt: input.nextFollowAt,
    createdAt: now
  };
  store.leadActivities.unshift(activity);
  lead.lastActivityAt = "刚刚";
  if (input.nextFollowAt) lead.nextFollowAt = input.nextFollowAt;
  if (lead.status === "new") lead.status = "following";
  await store.persist();
  return { activity, lead };
}

function normalizedMatchText(value: string) {
  return value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function emailDomain(value: string) {
  return value.trim().toLowerCase().split("@")[1] || "";
}

export function findCustomerMatches(user: SessionUser, lead: Lead) {
  const store = getStore();
  const leadCompany = normalizedMatchText(lead.company);
  const leadEmail = lead.email.trim().toLowerCase();
  const leadDomain = emailDomain(leadEmail);
  return store.customers
    .filter((customer) => canSeeOwner(user, customer.ownerId, customer.teamId))
    .map((customer) => {
      let score = 0;
      const reasons: string[] = [];
      const documentContact = customer.documentContact.toLowerCase();
      if (leadCompany && normalizedMatchText(customer.company) === leadCompany) {
        score += 80;
        reasons.push("公司名称一致");
      }
      if (leadEmail && documentContact.includes(leadEmail)) {
        score += 100;
        reasons.push("联系邮箱一致");
      } else if (leadDomain && documentContact.includes(`@${leadDomain}`)) {
        score += 50;
        reasons.push("邮箱域名一致");
      }
      const activeDeals = store.deals.filter((deal) =>
        deal.customerId === customer.id
        && !deal.archivedAt
        && deal.stage !== "丢单"
        && deal.stage !== "成交"
      );
      return { customer, score, reasons, activeDealCount: activeDeals.length };
    })
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score);
}