import customers from "../fixtures/customers.json";
import type { CustomerProfile } from "./priority";
import { getCaseByOrderId } from "./cases";

const profiles = customers as CustomerProfile[];

export function listCustomers(): CustomerProfile[] {
  return profiles;
}

export function getCustomer(customerId: string): CustomerProfile | null {
  return profiles.find((item) => item.customerId.toUpperCase() === customerId.trim().toUpperCase()) ?? null;
}

export function getCustomerByOrderId(orderId: string): CustomerProfile | null {
  const record = getCaseByOrderId(orderId);
  if (!record?.customerId) {
    return profiles.find((profile) => profile.orderIds.includes(orderId.toUpperCase())) ?? null;
  }
  return getCustomer(record.customerId);
}
