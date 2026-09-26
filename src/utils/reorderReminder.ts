import type { Customer } from "../store/customerStore";

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysSince(iso: string, now: number = Date.now()): number {
  return Math.floor((now - new Date(iso).getTime()) / DAY_MS);
}

/** A customer is due a reorder reminder once their last order is at least `thresholdDays` old. */
export function isReorderDue(
  customer: Pick<Customer, "lastOrderDate">,
  thresholdDays: number,
): boolean {
  return daysSince(customer.lastOrderDate) >= thresholdDays;
}
