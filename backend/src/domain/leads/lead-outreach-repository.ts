import type { Lead, LeadActivity, LeadOutreachAction, LeadOutreachRequest, User } from "../../types.js";

export interface LeadOutreachLookup {
  leadId: string;
  operatorId: string;
  action: LeadOutreachAction;
  idempotencyKeyHash: string;
}

export interface SocialTouchCompletion {
  request: LeadOutreachRequest;
  lead: Lead;
  activity: LeadActivity;
}

export interface EmailCompletion extends SocialTouchCompletion {
  user: User;
}

export interface LeadOutreachRepository {
  findByIdempotency(lookup: LeadOutreachLookup): Promise<LeadOutreachRequest | undefined>;
  insertPending(request: LeadOutreachRequest): Promise<{ inserted: boolean; request: LeadOutreachRequest }>;
  updatePending(request: LeadOutreachRequest): Promise<void>;
  completeSocialTouch(completion: SocialTouchCompletion): Promise<void>;
  completeEmail(completion: EmailCompletion): Promise<void>;
}

export class PersistenceConflictError extends Error {
  readonly code = "PERSISTENCE_CONFLICT";

  constructor(message: string) {
    super(message);
    this.name = "PersistenceConflictError";
  }
}

export type MemoryLeadOutreachOperation = "insert-pending" | "update-pending" | "complete-social-touch" | "complete-email";

export interface MemoryLeadOutreachRepositoryOptions {
  requests?: LeadOutreachRequest[];
  leads?: Lead[];
  activities?: LeadActivity[];
  users?: User[];
  beforeCommit?: (operation: MemoryLeadOutreachOperation) => void | Promise<void>;
}

export interface MemoryLeadOutreachSnapshot {
  requests: LeadOutreachRequest[];
  leads: Lead[];
  activities: LeadActivity[];
  users: User[];
}

export interface MemoryLeadOutreachRepository extends LeadOutreachRepository {
  snapshot(): MemoryLeadOutreachSnapshot;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function sameLookup(request: LeadOutreachRequest, lookup: LeadOutreachLookup) {
  return request.leadId === lookup.leadId
    && request.operatorId === lookup.operatorId
    && request.action === lookup.action
    && request.idempotencyKeyHash === lookup.idempotencyKeyHash;
}

export function createMemoryLeadOutreachRepository(options: MemoryLeadOutreachRepositoryOptions = {}): MemoryLeadOutreachRepository {
  let requests = clone(options.requests || []);
  let leads = clone(options.leads || []);
  let activities = clone(options.activities || []);
  let users = clone(options.users || []);

  const beforeCommit = async (operation: MemoryLeadOutreachOperation) => {
    await options.beforeCommit?.(operation);
  };

  const pendingRequest = (id: string) => {
    const existing = requests.find((item) => item.id === id);
    if (!existing || existing.status !== "pending") {
      throw new PersistenceConflictError("Lead outreach request " + id + " is not pending");
    }
    return existing;
  };

  const repository: MemoryLeadOutreachRepository = {
    async findByIdempotency(lookup) {
      const found = requests.find((item) => sameLookup(item, lookup));
      return found ? clone(found) : undefined;
    },

    async insertPending(request) {
      const lookup: LeadOutreachLookup = request;
      const existing = requests.find((item) => sameLookup(item, lookup));
      if (existing) return { inserted: false, request: clone(existing) };
      await beforeCommit("insert-pending");
      requests = [clone(request), ...requests];
      return { inserted: true, request: clone(request) };
    },

    async updatePending(request) {
      pendingRequest(request.id);
      await beforeCommit("update-pending");
      requests = requests.map((item) => item.id === request.id ? clone(request) : item);
    },

    async completeSocialTouch(completion) {
      pendingRequest(completion.request.id);
      if (!leads.some((item) => item.id === completion.lead.id && item.ownerId === completion.lead.ownerId && item.teamId === completion.lead.teamId && !item.deletedAt)) {
        throw new PersistenceConflictError("Lead " + completion.lead.id + " is outside the expected tenant scope");
      }
      if (activities.some((item) => item.id === completion.activity.id)) {
        throw new PersistenceConflictError("Lead activity " + completion.activity.id + " already exists");
      }
      await beforeCommit("complete-social-touch");
      requests = requests.map((item) => item.id === completion.request.id ? clone(completion.request) : item);
      leads = leads.map((item) => item.id === completion.lead.id ? clone(completion.lead) : item);
      activities = [clone(completion.activity), ...activities];
    },

    async completeEmail(completion) {
      pendingRequest(completion.request.id);
      if (!leads.some((item) => item.id === completion.lead.id && item.ownerId === completion.lead.ownerId && item.teamId === completion.lead.teamId && !item.deletedAt)) {
        throw new PersistenceConflictError("Lead " + completion.lead.id + " is outside the expected tenant scope");
      }
      if (!users.some((item) => item.id === completion.user.id && item.teamId === completion.user.teamId)) {
        throw new PersistenceConflictError("User " + completion.user.id + " is outside the expected tenant scope");
      }
      if (activities.some((item) => item.id === completion.activity.id)) {
        throw new PersistenceConflictError("Lead activity " + completion.activity.id + " already exists");
      }
      await beforeCommit("complete-email");
      requests = requests.map((item) => item.id === completion.request.id ? clone(completion.request) : item);
      leads = leads.map((item) => item.id === completion.lead.id ? clone(completion.lead) : item);
      users = users.map((item) => item.id === completion.user.id ? clone(completion.user) : item);
      activities = [clone(completion.activity), ...activities];
    },

    snapshot() {
      return clone({ requests, leads, activities, users });
    }
  };

  return repository;
}
