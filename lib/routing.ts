import { listCases } from "./cases";
import { listCustomers } from "./customer-profiles";
import {
  asksAboutProposedAction,
  asksForHuman,
  asksNextSteps,
  asksOrderSpecific,
  extractOrderId,
  isApproval,
  isRejection,
  wantsPrivateStatus,
} from "./language";
import { detectConversationIntent } from "./intent";

export type MessageKind =
  | "greeting"
  | "unrelated"
  | "unclear"
  | "approval"
  | "decline"
  | "action_request"
  | "follow_up"
  | "support";

export type ProfileConflict = {
  mentionedName: string;
  mentionedCustomerId: string;
  selectedName: string;
  selectedCustomerId: string;
  mentionedOrderId: string | null;
};

/**
 * Decide what the latest customer message is about before any case disclosure.
 * Messages without clear support cues must not open the selected profile's issue.
 */
export function classifyMessage(
  text: string,
  options?: { hasPendingAction?: boolean; hasTicket?: boolean; disclosedBefore?: boolean },
): MessageKind {
  const trimmed = text.trim();
  if (!trimmed) return "unclear";

  if (options?.hasPendingAction && isApproval(trimmed)) return "approval";
  if (options?.hasPendingAction && isRejection(trimmed)) return "decline";

  // Keep the live offer in context — "what will that do?" is not off-topic.
  if (
    options?.hasPendingAction &&
    (asksAboutProposedAction(trimmed) || asksNextSteps(trimmed) || isContextualCaseFollowUp(trimmed))
  ) {
    return "follow_up";
  }

  if (isUnclearSpeech(trimmed)) return "unclear";
  if (isGreeting(trimmed)) return "greeting";

  if (isClearlyOffTopic(trimmed)) return "unrelated";

  if (
    options?.hasTicket &&
    (asksNextSteps(trimmed) ||
      asksAboutProposedAction(trimmed) ||
      detectConversationIntent(trimmed).issueFocus === "ticket_status" ||
      detectConversationIntent(trimmed).wantsTicket ||
      isContextualCaseFollowUp(trimmed))
  ) {
    return "follow_up";
  }

  if (
    asksForHuman(trimmed) ||
    detectConversationIntent(trimmed).wantsTicket ||
    /\b(create|raise|open|make)\b.{0,24}\b(ticket|request|review)\b/i.test(trimmed)
  ) {
    return "action_request";
  }

  if (options?.disclosedBefore && isContextualCaseFollowUp(trimmed)) {
    return "follow_up";
  }

  if (hasSupportCues(trimmed)) return "support";

  // Default: chatty / lyric / off-topic — do not dump the signed-in case.
  return "unrelated";
}

export function findProfileConflict(
  text: string,
  selectedOrderId: string | null,
): ProfileConflict | null {
  const selected = selectedOrderId ? listCases().find((item) => item.orderId === selectedOrderId) : null;
  if (!selected?.customerId) return null;
  const selectedCustomer = listCustomers().find((item) => item.customerId === selected.customerId);
  if (!selectedCustomer) return null;

  const spokenOrder = extractOrderId(text);
  if (spokenOrder && spokenOrder !== selected.orderId) {
    const other = listCases().find((item) => item.orderId === spokenOrder);
    if (other && other.customerId && other.customerId !== selected.customerId) {
      const otherCustomer = listCustomers().find((item) => item.customerId === other.customerId);
      if (otherCustomer) {
        return {
          mentionedName: firstName(otherCustomer.name),
          mentionedCustomerId: otherCustomer.customerId,
          selectedName: firstName(selectedCustomer.name),
          selectedCustomerId: selectedCustomer.customerId,
          mentionedOrderId: spokenOrder,
        };
      }
    }
  }

  for (const customer of listCustomers()) {
    if (customer.customerId === selected.customerId) continue;
    if (mentionsCustomerName(text, customer.name)) {
      return {
        mentionedName: firstName(customer.name),
        mentionedCustomerId: customer.customerId,
        selectedName: firstName(selectedCustomer.name),
        selectedCustomerId: selectedCustomer.customerId,
        mentionedOrderId: customer.orderIds[0] ?? null,
      };
    }
  }

  return null;
}

/** Explicit cues that the customer is asking about an order / return / refund. */
export function hasSupportCues(text: string): boolean {
  if (extractOrderId(text) || asksForHuman(text) || asksNextSteps(text)) return true;
  if (asksOrderSpecific(text)) return true;
  if (detectConversationIntent(text).wantsTicket) return true;

  const focus = detectConversationIntent(text).issueFocus;
  if (focus === "refund_delay" || focus === "pickup" || focus === "qc_fail" || focus === "wrong_item") {
    return true;
  }
  if (focus === "ticket_status" || focus === "reference" || focus === "timeline" || focus === "human") {
    return true;
  }
  if (focus === "status" || focus === "amount") {
    // Require order-ish wording so bare chatter does not open the case.
    if (
      /\b(order|refund|return|pickup|ticket|my|mera|meri|mere|dress|jacket|kurta|payment)\b/i.test(text) ||
      /ऑर्डर|रिफंड|रिटर्न|पिकअप|मेरा|मेरी/u.test(text)
    ) {
      return true;
    }
  }

  if (
    /\b(order|return|refund|pickup|delivery|inspection|quality check|wrong item|final sale|payment support)\b/i.test(
      text,
    ) ||
    /ऑर्डर|रिटर्न|रिफंड|पिकअप|क्वालिटी|गलत आइटम|डिलीवरी/u.test(text)
  ) {
    return true;
  }

  // Signed-in status asks that wantsPrivateStatus catches (e.g. "status update") with order context.
  if (wantsPrivateStatus(text) && asksOrderSpecific(text)) return true;

  return false;
}

function isContextualCaseFollowUp(text: string): boolean {
  if (isClearlyOffTopic(text) || isGreeting(text)) return false;
  if (asksNextSteps(text) || asksAboutProposedAction(text) || detectConversationIntent(text).asksRepeatFacts) {
    return true;
  }
  if (hasSupportCues(text)) return true;
  // Pronouns / deixis about the ongoing issue — only when not off-topic.
  if (
    /^(and |so |then )?(what about|how about|what of)?\s*(it|that|this|uska|uski|usse|yeh|woh)\b/i.test(text.trim()) ||
    /\b(that refund|this refund|that order|this order|the ticket|my money|that request|that support)\b/i.test(text) ||
    /^(वह|यह|वो|उसका|उसकी|उससे|इससे|ये)\b/u.test(text.trim()) ||
    /क्या होगा|क्या बनेगा/u.test(text)
  ) {
    return true;
  }
  return false;
}

function isGreeting(text: string): boolean {
  return (
    /^(hi|hello|hey|namaste|namaskar|good (morning|afternoon|evening)|hola)([,.!]|\s|$)/i.test(text.trim()) &&
    text.trim().split(/\s+/).length <= 6 &&
    !asksOrderSpecific(text) &&
    !hasSupportCues(text)
  );
}

function isUnclearSpeech(text: string): boolean {
  const cleaned = text.replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
  if (!cleaned) return true;
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.length === 1 && cleaned.length <= 2;
}

function isClearlyOffTopic(text: string): boolean {
  if (hasSupportCues(text)) return false;

  if (
    /\b(song|sing|lyrics|music|gaana|gana|gaan|weather|cricket|football|recipe|joke|poem|shayari|gazal|ghazal)\b/i.test(
      text,
    ) ||
    /गीत|गाना|मौसम|क्रिकेट|जोक्स|कविता|शायरी/u.test(text) ||
    /(la\s*la|na\s*na|ooo+|हम्म+|ला\s*ला)/i.test(text)
  ) {
    return true;
  }

  // Romanized / poetic lines without any retail cues (e.g. Bollywood lyrics).
  if (
    /\b(zindagi|dil|ishq|pyaar|pyar|mohabbat|sajan|sajna|baarish|chand|sitare|yaadein|yaad)\b/i.test(text) &&
    !hasSupportCues(text)
  ) {
    return true;
  }

  if (/^(thanks|thank you|ok|okay|bye|cool|nice|great|wow|lol|haha)([,.!]|\s|$)/i.test(text.trim())) {
    return true;
  }
  return false;
}

function mentionsCustomerName(text: string, fullName: string): boolean {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return false;
  const first = parts[0];
  const last = parts[parts.length - 1];
  const escapedFirst = escapeRegExp(first);
  const escapedLast = escapeRegExp(last);
  if (new RegExp(`\\b${escapedFirst}\\s+${escapedLast}\\b`, "i").test(text)) return true;
  if (first.length >= 4 && new RegExp(`\\b${escapedFirst}\\b`, "i").test(text)) {
    if (!/\b(dress|jacket|kurta|shirt|saree|trousers)\b/i.test(first)) return true;
  }
  return false;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/).filter(Boolean)[0] ?? fullName;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
