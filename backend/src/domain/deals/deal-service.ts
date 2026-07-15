import { getStore } from "../../store.js";
import type { DealEvent } from "../../types.js";

export function createDealEvent(input: Omit<DealEvent, "id" | "createdAt"> & { createdAt?: string }) {
  const event: DealEvent = {
    ...input,
    id: `de_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: input.createdAt || new Date().toISOString()
  };
  getStore().dealEvents.unshift(event);
  return event;
}
