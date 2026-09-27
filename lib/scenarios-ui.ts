import type { CaseRecord } from "./types";

export type TesterCard = {
  alias: string;
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
};

type Guide = {
  title: string;
  customerProblem: string;
  trySaying: string[];
  whatAgentShouldDo: string;
  actionType: string;
  whyDifferent: string;
  primary: boolean;
};

const GUIDES: Record<string, Guide> = {
  "CASE-GOOD": {
    title: "Refund still inside normal time",
    customerProblem: "Prepaid dress refund started 4 working days ago. Customer has not received money yet.",
    trySaying: [
      "Where is my dress refund for order VW-1001?",
      "Has refund RF-104 been paid yet?",
    ],
    whatAgentShouldDo:
      "Use the signed-in order. Share reference RF-104 and say money usually comes in 5–7 working days. Do not open a ticket.",
    actionType: "Explain only · no ticket",
    whyDifferent: "This proves the agent waits for the normal window instead of escalating too early.",
    primary: true,
  },
  "CASE-BAD": {
    title: "Prepaid refund is late",
    customerProblem: "Jacket refund started 9 working days ago. Customer already called twice.",
    trySaying: [
      "My jacket refund for VW-1002 is late — can you open payment support?",
      "Why hasn’t RF-209 arrived after 9 working days?",
    ],
    whatAgentShouldDo:
      "Share RF-209, mention earlier contacts, then ask approval before creating one payment-support ticket.",
    actionType: "Payment support ticket · after approval",
    whyDifferent: "This is the only prepaid overdue path that should create a payment ticket.",
    primary: true,
  },
  "CASE-COD": {
    title: "COD refund still inside time",
    customerProblem: "COD kurta refund started 8 working days ago. Bank choice is already saved.",
    trySaying: [
      "Has my COD kurta refund for VW-1003 arrived?",
      "When should RF-310 reach my bank?",
    ],
    whatAgentShouldDo: "Share RF-310 and the COD 7–10 day window. Do not ask for bank details. Do not open a ticket.",
    actionType: "Explain only · never ask bank details",
    whyDifferent: "COD uses a longer window and must never collect full bank details aloud.",
    primary: true,
  },
  "CASE-PICKUP": {
    title: "Return pickup is delayed",
    customerProblem: "Trousers return accepted, but pickup is still pending after 4 working days.",
    trySaying: [
      "My trousers pickup for VW-1004 is still pending.",
      "Can you raise pickup support for this return?",
    ],
    whatAgentShouldDo: "Offer a pickup/logistics support request. Do not promise refund money or open a payment ticket.",
    actionType: "Pickup support ticket · after approval",
    whyDifferent: "Pickup delay is a logistics issue, not a refund-delay issue.",
    primary: true,
  },
  "CASE-QC": {
    title: "Quality check failed",
    customerProblem: "Dress was picked up, but inspection failed because tags were missing.",
    trySaying: [
      "Why did my dress return for VW-1005 fail quality check?",
      "Can this go to human review for missing tags?",
    ],
    whatAgentShouldDo: "Explain missing tags and offer human review. Do not start a refund or say the case is closed.",
    actionType: "Human review · after approval",
    whyDifferent: "Failed inspection blocks refund. Agent can only explain and hand over for review.",
    primary: true,
  },
  "CASE-UNKNOWN": {
    title: "System status missing",
    customerProblem: "Order exists, but return/refund status is unavailable in the demo system.",
    trySaying: [
      "Where is my refund for order VW-1006?",
      "Can someone check the missing status on VW-1006?",
    ],
    whatAgentShouldDo: "Clearly say status is not available. Offer a human status check. Do not invent dates or refund references.",
    actionType: "Human status check · no invented facts",
    whyDifferent: "Tests honesty when data is incomplete.",
    primary: true,
  },
  "CASE-FINAL": {
    title: "Wrong item on final-sale product",
    customerProblem: "Customer got the wrong innerwear item. Product is marked final sale.",
    trySaying: [
      "I received the wrong innerwear on order VW-1007.",
      "Can final-sale wrong item go to human review?",
    ],
    whatAgentShouldDo:
      "Explain final sale is normally non-returnable, but wrong item can go to human review. Do not auto-approve return or refund.",
    actionType: "Exception review · no auto approval",
    whyDifferent: "Exception path: final sale + wrong item, not a normal refund delay.",
    primary: true,
  },
  "CASE-PICKUP-3": {
    title: "Pickup boundary: exactly 3 days",
    customerProblem: "Pickup pending for exactly 3 working days.",
    trySaying: ["Pickup for VW-1008 has been pending for 3 working days."],
    whatAgentShouldDo: "Explain that exactly 3 days is not late enough for pickup support.",
    actionType: "No ticket · boundary check",
    whyDifferent: "Shows the agent respects the exact threshold.",
    primary: false,
  },
  "CASE-PREPAID-7": {
    title: "Prepaid boundary: exactly 7 days",
    customerProblem: "Prepaid refund started exactly 7 working days ago.",
    trySaying: ["Is my VW-1009 refund late after exactly 7 working days?"],
    whatAgentShouldDo: "Share RF-707 and say exactly 7 days is not late enough for payment support.",
    actionType: "No ticket · boundary check",
    whyDifferent: "Shows prepaid escalation starts only after more than 7 days.",
    primary: false,
  },
  "CASE-COD-10": {
    title: "COD boundary: exactly 10 days",
    customerProblem: "COD refund started exactly 10 working days ago.",
    trySaying: ["Is my COD refund for VW-1010 late after 10 working days?"],
    whatAgentShouldDo: "Share RF-810 and say exactly 10 days is not late enough for payment support.",
    actionType: "No ticket · boundary check",
    whyDifferent: "Shows COD escalation starts only after more than 10 days.",
    primary: false,
  },
};

export function buildTesterCard(record: CaseRecord): TesterCard {
  const guide = GUIDES[record.alias];
  const trySaying =
    guide?.trySaying ??
    [`What is the status of my ${record.product} order ${record.orderId}?`];
  return {
    alias: record.alias,
    orderId: record.orderId,
    pin: record.pin,
    product: record.product,
    productId: record.productId,
    amountInr: record.amountInr,
    paymentMethod: record.paymentMethod,
    issue: record.issue,
    caseState: record.caseState,
    situation: record.situation,
    title: guide?.title ?? record.alias,
    customerProblem: guide?.customerProblem ?? record.situation,
    whatToSay: trySaying[0] ?? `Order ${record.orderId}.`,
    trySaying,
    whatAgentShouldDo: guide?.whatAgentShouldDo ?? "Explain the verified facts for the signed-in order.",
    actionType: guide?.actionType ?? "Explain",
    whyDifferent: guide?.whyDifferent ?? "Different case state.",
    primary: guide?.primary ?? true,
  };
}
