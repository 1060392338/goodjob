import { canSeeOwner, canSeePersonalData } from "../../auth.js";
import { getStore } from "../../store.js";
import type { Customer, CustomerActivity, CustomerActivityType, SessionUser } from "../../types.js";

export interface CreateCustomerInput {
  company: string;
  country: string;
  contact: string;
  stage: string;
  amount: number;
  billingName: string;
  billingAddress: string;
  documentContact: string;
  defaultPortDischarge: string;
  defaultIncoterm: string;
  defaultPaymentTerm: string;
}

export type UpdateCustomerInput = Partial<Pick<Customer,
  | "company"
  | "country"
  | "contact"
  | "stage"
  | "amount"
  | "nextReminder"
  | "wecomBound"
  | "billingName"
  | "billingAddress"
  | "documentContact"
  | "defaultPortDischarge"
  | "defaultIncoterm"
  | "defaultPaymentTerm"
>>;

export interface CreateCustomerActivityInput {
  type: CustomerActivityType;
  content: string;
  nextReminder: string;
}

const pipelineStageRank: Record<string, number> = {
  "询盘": 1,
  "已联系": 2,
  "已报价": 3,
  "样品": 4,
  "谈判": 5,
  "成交": 6
};

export function customerWithPipeline(customer: Customer) {
  const store = getStore();
  const activeDeals = store.deals.filter((deal) =>
    deal.customerId === customer.id
    && !deal.archivedAt
    && deal.stage !== "丢单"
    && deal.stage !== "成交"
  );
  const activities = store.customerActivities
    .filter((activity) => activity.customerId === customer.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const pipelineStage = activeDeals.reduce((best, deal) =>
    (pipelineStageRank[deal.stage] || 0) > (pipelineStageRank[best] || 0) ? deal.stage : best, ""
  );
  return {
    ...customer,
    ownerName: store.users.find((user) => user.id === customer.ownerId)?.name || "未分配",
    activities: activities.map((activity) => ({
      ...activity,
      operatorName: store.users.find((user) => user.id === activity.operatorId)?.name || "未知操作人"
    })),
    lastActivityAt: activities[0]?.createdAt || "",
    pipelineStage: pipelineStage || "暂无活跃商机",
    pipelineAmount: activeDeals.reduce((sum, deal) => sum + deal.amount, 0),
    activeDealCount: activeDeals.length
  };
}

export function listVisibleCustomers(user: SessionUser) {
  return getStore().customers
    .filter((customer) => canSeeOwner(user, customer.ownerId, customer.teamId))
    .map(customerWithPipeline);
}

export async function createCustomer(user: SessionUser, input: CreateCustomerInput) {
  const store = getStore();
  const customer: Customer = {
    id: `c_${Date.now()}`,
    ownerId: user.id,
    teamId: user.teamId,
    health: 72,
    nextReminder: "明天 10:00",
    wecomBound: false,
    ...input
  };
  store.customers.unshift(customer);
  await store.persist();
  return customerWithPipeline(customer);
}

export async function updateCustomer(user: SessionUser, customerId: string, input: UpdateCustomerInput) {
  const store = getStore();
  const customer = store.customers.find((item) => item.id === customerId);
  if (!customer || !canSeeOwner(user, customer.ownerId, customer.teamId)) return null;
  Object.assign(customer, input);
  await store.persist();
  return customerWithPipeline(customer);
}

export async function deleteVisibleCustomers(user: SessionUser, requestedIds: string[]) {
  const store = getStore();
  const ids = [...new Set(requestedIds)];
  const deleted = store.customers.filter((customer) =>
    ids.includes(customer.id) && canSeeOwner(user, customer.ownerId, customer.teamId)
  );
  if (!deleted.length) return null;

  const deletedIds = new Set(deleted.map((customer) => customer.id));
  const deletedNames = deleted.map((customer) => customer.company);
  store.customers = store.customers.filter((customer) => !deletedIds.has(customer.id));
  store.customerActivities = store.customerActivities.filter((activity) => !deletedIds.has(activity.customerId));
  const deletedDealIds = new Set(
    store.deals.filter((deal) => deletedIds.has(deal.customerId)).map((deal) => deal.id)
  );
  store.deals = store.deals.filter((deal) => !deletedIds.has(deal.customerId));
  store.dealEvents = store.dealEvents.filter((event) => !deletedDealIds.has(event.dealId));
  store.todos = store.todos.filter((todo) => {
    const currentUserTodo = canSeePersonalData(user, todo.ownerId);
    const relatedToDeletedCustomer = deletedNames.some((name) =>
      todo.related.includes(name) || todo.title.includes(name)
    );
    return !currentUserTodo || !relatedToDeletedCustomer;
  });
  await store.persist();
  const customers = store.customers.filter((customer) =>
    canSeeOwner(user, customer.ownerId, customer.teamId)
  );
  return { deleted, customers };
}

export async function addCustomerActivity(
  user: SessionUser,
  customerId: string,
  input: CreateCustomerActivityInput
) {
  const store = getStore();
  const customer = store.customers.find((item) => item.id === customerId);
  if (!customer || !canSeeOwner(user, customer.ownerId, customer.teamId)) return null;

  const activity: CustomerActivity = {
    id: `ca_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    customerId: customer.id,
    type: input.type,
    content: input.content,
    operatorId: user.id,
    nextReminder: input.nextReminder,
    createdAt: new Date().toISOString()
  };
  store.customerActivities.unshift(activity);
  if (input.nextReminder) customer.nextReminder = input.nextReminder;
  await store.persist();
  return { activity, customer: customerWithPipeline(customer) };
}
