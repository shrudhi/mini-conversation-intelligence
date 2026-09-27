import "server-only";

import { formatInr, getCaseByOrderId, listCases } from "./cases";
import { customerAvatarSrc } from "./avatars";
import {
  getCustomer,
  getCustomerByOrderId,
  listCustomers,
} from "./customer-profiles";
import { historyForCustomer, listConversationHistory } from "./feedback";
import { assessPriority, type CustomerProfile, type PriorityAssessment } from "./priority";
import { outcomeFromConversation } from "./conversation-outcome";
import { buildTesterCard } from "./scenarios-ui";
import type { FixturePastConversation, PastConversationEntry } from "./types";

export type WorkspaceCard = {
  customerId: string;
  customerName: string;
  avatarUrl: string;
  city: string;
  segment: string;
  behavior: string;
  preferredLanguage: string;
  escalationLevel: number;
  memberSince: string;
  pastIssues: CustomerProfile["pastIssues"];
  pastConversations: PastConversationEntry[];
  orderId: string;
  pin: string;
  product: string;
  productId: string;
  amountInr: number;
  paymentMethod: string;
  issue: string;
  caseState: string;
  situation: string;
  title: string;
  customerProblem: string;
  whatToSay: string;
  trySaying: string[];
  whatAgentShouldDo: string;
  actionType: string;
  whyDifferent: string;
  primary: boolean;
  priority: PriorityAssessment;
  amountLabel: string;
  lastSessionSavedAt?: string | null;
};

export async function buildWorkspaceCard(orderId: string): Promise<WorkspaceCard | null> {
  const record = getCaseByOrderId(orderId);
  const customer = getCustomerByOrderId(orderId);
  if (!record || !customer) return null;
  const tester = buildTesterCard(record);
  const priority = assessPriority({ record, customer });
  const persisted = await listConversationHistory();
  const pastConversations = historyForCustomer(
    customer.customerId,
    (customer.pastConversations ?? []) as FixturePastConversation[],
    persisted,
  ).map((entry) => ({
    ...entry,
    priority: entry.priority ?? priority.level,
  }));
  const latestSaved = persisted
    .filter((item) => item.customerId === customer.customerId)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))[0]?.savedAt ?? null;
  return {
    customerId: customer.customerId,
    customerName: customer.name,
    avatarUrl: customerAvatarSrc(customer.customerId),
    city: customer.city,
    segment: customer.segment,
    behavior: customer.behavior,
    preferredLanguage: customer.preferredLanguage,
    escalationLevel: customer.escalationLevel,
    memberSince: customer.memberSince,
    pastIssues: customer.pastIssues,
    pastConversations,
    orderId: record.orderId,
    pin: record.pin,
    product: record.product,
    productId: record.productId,
    amountInr: record.amountInr,
    paymentMethod: record.paymentMethod,
    issue: record.issue,
    caseState: record.caseState,
    situation: record.situation,
    title: tester.title,
    customerProblem: tester.customerProblem,
    whatToSay: tester.whatToSay,
    trySaying: tester.trySaying,
    whatAgentShouldDo: tester.whatAgentShouldDo,
    actionType: tester.actionType,
    whyDifferent: tester.whyDifferent,
    primary: tester.primary,
    priority,
    amountLabel: formatInr(record.amountInr),
    lastSessionSavedAt: latestSaved,
  };
}

export async function listWorkspaceCards(options?: { includeBoundary?: boolean }): Promise<WorkspaceCard[]> {
  const cards = await Promise.all(listCases().map((record) => buildWorkspaceCard(record.orderId)));
  return cards
    .filter((card): card is WorkspaceCard => Boolean(card))
    .filter((card) => options?.includeBoundary || card.primary);
}

export async function loginWorkspace(
  customerId: string,
  orderId: string,
): Promise<{ ok: true; card: WorkspaceCard } | { ok: false; error: string }> {
  const customer = getCustomer(customerId);
  if (!customer) {
    return { ok: false, error: "Customer ID not found. Use a demo ID like CUST-1001." };
  }
  const normalizedOrder = orderId.trim().toUpperCase();
  if (!customer.orderIds.map((id) => id.toUpperCase()).includes(normalizedOrder)) {
    return {
      ok: false,
      error: `Order ${normalizedOrder} does not belong to ${customer.customerId}. Try one of: ${customer.orderIds.join(", ")}.`,
    };
  }
  const card = await buildWorkspaceCard(normalizedOrder);
  if (!card) return { ok: false, error: "That order could not be loaded." };
  return { ok: true, card };
}

export { getCustomer, getCustomerByOrderId, listCustomers, outcomeFromConversation };
