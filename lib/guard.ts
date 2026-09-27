import { listCases, formatInr } from "./cases";
import { listCustomers } from "./customer-profiles";

const POLICY_DAYS = new Set([1, 2, 3, 5, 7, 10]);

export type GuardInput = {
  disclosed: boolean;
  allowedReferences: string[];
  allowedAmounts: number[];
  allowedDayCounts: number[];
  allowedOrderId?: string | null;
  allowedCustomerId?: string | null;
};

export function guardReply(reply: string, input: GuardInput): string | null {
  for (const record of listCases()) {
    if (new RegExp(`\\b${record.pin}\\b`).test(reply)) {
      return "The reply included a demo PIN.";
    }
  }

  const references = reply.match(/RF-[A-Z0-9]+/g) ?? [];
  for (const reference of references) {
    if (!input.disclosed || !input.allowedReferences.includes(reference)) {
      return "The reply included a refund reference that was not verified for this turn.";
    }
  }

  for (const record of listCases()) {
    const formatted = formatInr(record.amountInr);
    const mentioned = reply.includes(formatted) || new RegExp(`\\b${record.amountInr}\\b`).test(reply);
    if (!mentioned) continue;
    if (!input.disclosed || !input.allowedAmounts.includes(record.amountInr)) {
      return "The reply included an order amount that was not verified for this turn.";
    }
  }

  if (input.disclosed) {
    for (const record of listCases()) {
      if (record.orderId === input.allowedOrderId) continue;
      if (new RegExp(`\\b${record.orderId}\\b`, "i").test(reply)) {
        return "The reply mentioned another customer's order ID.";
      }
    }

    for (const customer of listCustomers()) {
      if (customer.customerId === input.allowedCustomerId) continue;
      if (new RegExp(`\\b${customer.customerId}\\b`, "i").test(reply)) {
        return "The reply mentioned another customer's ID.";
      }
    }
  }

  if (/\b(P[123]\s*score|priority score|escalation level\s*\d|internal note|agent note)\b/i.test(reply)) {
    return "The reply leaked internal priority or operations notes.";
  }

  if (/\b(DEMO-PIN|secret key|api key|idempotency key)\b/i.test(reply)) {
    return "The reply included a confidential system secret.";
  }

  const days = [...reply.matchAll(/(\d+)\s+working days/gi)].map((match) => Number(match[1]));
  const allowedDays = new Set<number>([...POLICY_DAYS, ...(input.disclosed ? input.allowedDayCounts : [])]);
  for (const day of days) {
    if (!allowedDays.has(day)) return "The reply used a working-day count that is not in the verified record or the policy thresholds.";
  }

  if (requestsSecret(reply)) return "The reply asked for a forbidden secret.";
  return null;
}

function requestsSecret(reply: string): boolean {
  return reply.split(/[.!?।]/).some((sentence) => {
    if (/\b(not|never|won't|will not|don't|do not|nahi|mat)\b/i.test(sentence) || /नहीं|मत/u.test(sentence)) {
      return false;
    }
    return /\b(otp|one-time password|card number|cvv|password|account number|ifsc|full bank)\b/i.test(sentence);
  });
}

export function constraintsFor(
  record: {
    orderId?: string;
    customerId?: string;
    refund: { reference: string | null; workingDaysSinceInitiation: number | null };
    amountInr: number;
    returnRequest: { pickupWorkingDaysElapsed: number | null };
  } | null,
  disclosed: boolean,
): GuardInput {
  if (!disclosed || !record) {
    return {
      disclosed: false,
      allowedReferences: [],
      allowedAmounts: [],
      allowedDayCounts: [],
      allowedOrderId: null,
      allowedCustomerId: null,
    };
  }
  const days = [record.refund.workingDaysSinceInitiation, record.returnRequest.pickupWorkingDaysElapsed].filter(
    (value): value is number => typeof value === "number",
  );
  return {
    disclosed: true,
    allowedReferences: record.refund.reference ? [record.refund.reference] : [],
    allowedAmounts: [record.amountInr],
    allowedDayCounts: days,
    allowedOrderId: record.orderId ?? null,
    allowedCustomerId: record.customerId ?? null,
  };
}
