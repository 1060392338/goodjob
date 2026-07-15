import { createHash, randomUUID } from "node:crypto";
import { canSeeOwner, publicUser } from "../../auth.js";
import type { OutboundEmailGateway } from "../../gateways/outbound-email-gateway.js";
import { outboundEmailError } from "../../gateways/outbound-email-gateway.js";
import { getStore } from "../../store.js";
import type { Lead, LeadActivity, LeadOutreachAction, LeadOutreachRequest, SessionUser, User } from "../../types.js";

export interface SocialTouchInput {
  channel: "call" | "wechat" | "whatsapp" | "linkedin";
  message: string;
  nextFollowAt: string;
}

export interface LeadEmailInput {
  to: string;
  subject: string;
  body: string;
  nextFollowAt: string;
}

const channelText: Record<SocialTouchInput["channel"], string> = {
  call: "电话",
  wechat: "微信",
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn"
};

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function payloadDigest(payload: object) {
  return digest(JSON.stringify(payload));
}

function generatedKey() {
  return `generated:${randomUUID()}`;
}

function classifyExisting(existing: LeadOutreachRequest, currentPayloadHash: string) {
  if (existing.payloadHash !== currentPayloadHash) return { status: "conflict" as const, request: existing };
  if (existing.status === "succeeded") return { status: "duplicate" as const, request: existing };
  if (existing.status === "pending") return { status: "pending" as const, request: existing };
  return { status: "failed" as const, request: existing };
}

function syncOutreachRequest(request: LeadOutreachRequest) {
  const store = getStore();
  const existing = store.leadOutreachRequests.find((item) => item.id === request.id);
  if (existing) {
    Object.assign(existing, request);
    return existing;
  }
  const added = { ...request };
  store.leadOutreachRequests.unshift(added);
  return added;
}

async function beginOutreach(
  user: SessionUser,
  lead: Lead,
  action: LeadOutreachAction,
  channel: string,
  payload: object,
  idempotencyKey?: string
) {
  const store = getStore();
  const rawKey = idempotencyKey?.trim() || generatedKey();
  const keyHash = digest(rawKey);
  const currentPayloadHash = payloadDigest(payload);
  const lookup = { leadId: lead.id, operatorId: user.id, action, idempotencyKeyHash: keyHash };
  const existing = store.leadOutreachRepository
    ? await store.leadOutreachRepository.findByIdempotency(lookup)
    : store.leadOutreachRequests.find((item) =>
      item.leadId === lead.id
      && item.operatorId === user.id
      && item.action === action
      && item.idempotencyKeyHash === keyHash
    );
  if (existing) return classifyExisting(syncOutreachRequest(existing), currentPayloadHash);

  const now = new Date().toISOString();
  const request: LeadOutreachRequest = {
    id: `lor_${digest(`${lead.id}:${user.id}:${action}:${keyHash}`).slice(0, 40)}`,
    leadId: lead.id,
    operatorId: user.id,
    action,
    channel,
    idempotencyKeyHash: keyHash,
    payloadHash: currentPayloadHash,
    status: "pending",
    activityId: "",
    externalMessageId: "",
    recipient: "",
    subject: "",
    errorMessage: "",
    createdAt: now,
    completedAt: ""
  };

  if (store.leadOutreachRepository) {
    const inserted = await store.leadOutreachRepository.insertPending(request);
    const persisted = syncOutreachRequest(inserted.request);
    return inserted.inserted ? { status: "new" as const, request: persisted } : classifyExisting(persisted, currentPayloadHash);
  }

  store.leadOutreachRequests.unshift(request);
  try {
    await store.persist();
  } catch (error) {
    store.leadOutreachRequests = store.leadOutreachRequests.filter((item) => item !== request);
    throw error;
  }
  return { status: "new" as const, request };
}

function findVisibleLead(user: SessionUser, leadId: string) {
  const lead = getStore().leads.find((item) => item.id === leadId);
  if (!lead || !canSeeOwner(user, lead.ownerId, lead.teamId) || lead.deletedAt) return null;
  return lead;
}

function activityFor(request: LeadOutreachRequest) {
  return getStore().leadActivities.find((item) => item.id === request.activityId);
}

function outreachUnavailableMessage(request: LeadOutreachRequest) {
  if (request.status === "pending") return "相同幂等键的请求正在处理或结果尚未确认，请勿重复发送";
  return request.errorMessage || "相同幂等键的上次请求失败，请使用新的幂等键重试";
}

export type SocialTouchResult =
  | { status: "not_found" }
  | { status: "conflict"; message: string }
  | { status: "unavailable"; message: string }
  | { status: "ok"; activity: LeadActivity; lead: Lead; duplicate: boolean };

export async function recordSocialTouch(
  user: SessionUser,
  leadId: string,
  input: SocialTouchInput,
  idempotencyKey?: string
): Promise<SocialTouchResult> {
  const store = getStore();
  const lead = findVisibleLead(user, leadId);
  if (!lead) return { status: "not_found" };
  const begin = await beginOutreach(user, lead, "social-touch", input.channel, input, idempotencyKey);
  if (begin.status === "conflict") return { status: "conflict", message: "Idempotency-Key 已用于不同的社交触达请求" };
  if (begin.status === "pending" || begin.status === "failed") {
    return { status: "unavailable", message: outreachUnavailableMessage(begin.request) };
  }
  if (begin.status === "duplicate") {
    const activity = activityFor(begin.request);
    if (!activity) return { status: "unavailable", message: "幂等记录缺少对应活动，请人工核查后重试" };
    return { status: "ok", activity, lead, duplicate: true };
  }

  const now = new Date().toISOString();
  const activity: LeadActivity = {
    id: `la_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    leadId: lead.id,
    type: input.channel,
    content: `${channelText[input.channel]}触达：${input.message}`,
    operatorId: user.id,
    nextFollowAt: input.nextFollowAt,
    createdAt: now
  };
  const nextLead: Lead = {
    ...lead,
    lastActivityAt: "刚刚",
    ...(input.nextFollowAt ? { nextFollowAt: input.nextFollowAt } : {}),
    ...(lead.status === "new" ? { status: "following" as const } : {})
  };
  const nextRequest: LeadOutreachRequest = { ...begin.request, status: "succeeded", activityId: activity.id, completedAt: now };

  if (store.leadOutreachRepository) {
    await store.leadOutreachRepository.completeSocialTouch({ request: nextRequest, lead: nextLead, activity });
    Object.assign(lead, nextLead);
    Object.assign(begin.request, nextRequest);
    store.leadActivities = [activity, ...store.leadActivities];
  } else {
    const leadSnapshot = { ...lead };
    const requestSnapshot = { ...begin.request };
    const activitiesSnapshot = store.leadActivities;
    Object.assign(lead, nextLead);
    Object.assign(begin.request, nextRequest);
    store.leadActivities = [activity, ...store.leadActivities];
    try {
      await store.persist();
    } catch (error) {
      Object.assign(lead, leadSnapshot);
      Object.assign(begin.request, requestSnapshot);
      store.leadActivities = activitiesSnapshot;
      throw error;
    }
  }
  return { status: "ok", activity, lead, duplicate: false };
}

function emailResponse(user: User, lead: Lead, request: LeadOutreachRequest, activity: LeadActivity, duplicate: boolean) {
  return {
    sent: {
      id: `mail_${request.id.slice(4)}`,
      status: "sent",
      simulated: process.env.NODE_ENV === "test",
      messageId: request.externalMessageId,
      from: user.outboundEmail,
      senderName: user.emailSenderName || user.name,
      to: request.recipient,
      company: lead.company,
      subject: request.subject,
      sentAt: request.completedAt
    },
    activity,
    lead,
    user: { ...publicUser(user), status: user.status },
    ...(duplicate ? { duplicate: true } : {})
  };
}

function uncertainEmailFailure(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "") : "";
  return ["ESOCKET", "ECONNECTION", "ETIMEDOUT"].includes(code);
}

export type SendLeadEmailResult =
  | { status: "account_not_found" }
  | { status: "not_found" }
  | { status: "conflict"; message: string }
  | { status: "unavailable"; message: string }
  | { status: "send_failed"; message: string }
  | { status: "ok"; response: ReturnType<typeof emailResponse> };

export async function sendLeadEmail(
  sessionUser: SessionUser,
  leadId: string,
  input: LeadEmailInput,
  gateway: OutboundEmailGateway,
  idempotencyKey?: string
): Promise<SendLeadEmailResult> {
  const store = getStore();
  const user = store.users.find((item) => item.id === sessionUser.id);
  if (!user) return { status: "account_not_found" };
  const lead = findVisibleLead(sessionUser, leadId);
  if (!lead) return { status: "not_found" };
  const begin = await beginOutreach(sessionUser, lead, "send-email", "email", input, idempotencyKey);
  if (begin.status === "conflict") return { status: "conflict", message: "Idempotency-Key 已用于不同的邮件请求" };
  if (begin.status === "pending" || begin.status === "failed") {
    return { status: "unavailable", message: outreachUnavailableMessage(begin.request) };
  }
  if (begin.status === "duplicate") {
    const activity = activityFor(begin.request);
    if (!activity) return { status: "unavailable", message: "幂等记录缺少对应邮件活动，请人工核查后重试" };
    return { status: "ok", response: emailResponse(user, lead, begin.request, activity, true) };
  }

  let receipt;
  try {
    receipt = await gateway.send(user, { to: input.to, subject: input.subject, body: input.body });
  } catch (error) {
    const message = outboundEmailError(error, user);
    const nextRequest: LeadOutreachRequest = {
      ...begin.request,
      status: uncertainEmailFailure(error) ? "pending" : "failed",
      errorMessage: message,
      completedAt: uncertainEmailFailure(error) ? "" : new Date().toISOString()
    };
    if (store.leadOutreachRepository) {
      await store.leadOutreachRepository.updatePending(nextRequest);
      Object.assign(begin.request, nextRequest);
    } else {
      const snapshot = { ...begin.request };
      Object.assign(begin.request, nextRequest);
      try {
        await store.persist();
      } catch (persistError) {
        Object.assign(begin.request, snapshot);
        throw persistError;
      }
    }
    return { status: "send_failed", message };
  }

  const sentAt = new Date().toISOString();
  const activity: LeadActivity = {
    id: `la_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    leadId: lead.id,
    type: "email",
    content: `邮件发送：${input.subject}`,
    operatorId: sessionUser.id,
    nextFollowAt: input.nextFollowAt,
    createdAt: sentAt
  };
  const nextLead: Lead = {
    ...lead,
    lastActivityAt: "刚刚",
    ...(input.nextFollowAt ? { nextFollowAt: input.nextFollowAt } : {}),
    ...(lead.status === "new" ? { status: "following" as const } : {})
  };
  const nextUser: User = {
    ...user,
    lastDevelopmentEmailAt: sentAt,
    lastDevelopmentEmailTo: input.to,
    lastDevelopmentEmailSubject: input.subject
  };
  const nextRequest: LeadOutreachRequest = {
    ...begin.request,
    status: "succeeded",
    activityId: activity.id,
    externalMessageId: receipt.messageId,
    recipient: input.to,
    subject: input.subject,
    errorMessage: "",
    completedAt: sentAt
  };

  if (store.leadOutreachRepository) {
    await store.leadOutreachRepository.completeEmail({ request: nextRequest, lead: nextLead, user: nextUser, activity });
    Object.assign(lead, nextLead);
    Object.assign(user, nextUser);
    Object.assign(begin.request, nextRequest);
    store.leadActivities = [activity, ...store.leadActivities];
  } else {
    const leadSnapshot = { ...lead };
    const userSnapshot = { ...user };
    const requestSnapshot = { ...begin.request };
    const activitiesSnapshot = store.leadActivities;
    Object.assign(lead, nextLead);
    Object.assign(user, nextUser);
    Object.assign(begin.request, nextRequest);
    store.leadActivities = [activity, ...store.leadActivities];
    try {
      await store.persist();
    } catch (error) {
      Object.assign(lead, leadSnapshot);
      Object.assign(user, userSnapshot);
      Object.assign(begin.request, requestSnapshot);
      store.leadActivities = activitiesSnapshot;
      throw error;
    }
  }
  return { status: "ok", response: emailResponse(user, lead, begin.request, activity, false) };
}
