import cases from "../fixtures/cases.json";
import policies from "../fixtures/policies.json";
import { buildTesterCard, type TesterCard } from "./scenarios-ui";
import type { CaseRecord, PolicyChunk, ToolCall } from "./types";

const records = cases as CaseRecord[];
const policyList = policies as PolicyChunk[];

export function listCases(): CaseRecord[] {
  return records;
}

export function listPolicies(): PolicyChunk[] {
  return policyList;
}

export function getPolicy(id: string): PolicyChunk | null {
  return policyList.find((policy) => policy.id === id) ?? null;
}

export function policyQuote(id: string): string {
  const policy = getPolicy(id);
  if (!policy) return "";
  const sentence = policy.text.split(". ")[0];
  return sentence.endsWith(".") ? sentence : `${sentence}.`;
}

export function getCaseByAlias(alias: string): CaseRecord | null {
  return records.find((item) => item.alias === alias) ?? null;
}

export function getCaseByOrderId(orderId: string): CaseRecord | null {
  const normalized = orderId.trim().toUpperCase();
  return records.find((item) => item.orderId === normalized) ?? null;
}

export function verifyPin(
  orderId: string,
  pin: string,
): { ok: true; record: CaseRecord } | { ok: false; reason: "not_found" | "bad_pin" } {
  const record = getCaseByOrderId(orderId);
  if (!record) return { ok: false, reason: "not_found" };
  if (record.pin !== pin.trim()) return { ok: false, reason: "bad_pin" };
  return { ok: true, record };
}

export function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function demoCards(options?: { includeBoundary?: boolean }): TesterCard[] {
  return records
    .map((record) => buildTesterCard(record))
    .filter((card) => options?.includeBoundary || card.primary);
}

export function lookupTools(record: CaseRecord | null, toolFailure: boolean): ToolCall[] {
  if (toolFailure || !record) {
    const reason = toolFailure ? "tool_failure" : "pin_required";
    return [
      { name: "get_order", available: false, reason, facts: null },
      { name: "get_return", available: false, reason, facts: null },
      { name: "get_refund", available: false, reason, facts: null },
    ];
  }
  return [
    {
      name: "get_order",
      available: true,
      reason: null,
      facts: {
        orderId: record.orderId,
        product: record.product,
        amountInr: record.amountInr,
        paymentMethod: record.paymentMethod,
        finalSale: record.finalSale,
        priorContacts: record.priorContacts,
      },
    },
    {
      name: "get_return",
      available: true,
      reason: null,
      facts: {
        accepted: record.returnRequest.accepted,
        pickupStatus: record.returnRequest.pickupStatus,
        pickupWorkingDaysElapsed: record.returnRequest.pickupWorkingDaysElapsed,
        inspectionStatus: record.returnRequest.inspectionStatus,
        inspectionReason: record.returnRequest.inspectionReason,
      },
    },
    {
      name: "get_refund",
      available: true,
      reason: null,
      facts: {
        initiated: record.refund.initiated,
        reference: record.refund.reference,
        workingDaysSinceInitiation: record.refund.workingDaysSinceInitiation,
        received: record.refund.received,
        destination: record.refund.destination,
      },
    },
  ];
}
