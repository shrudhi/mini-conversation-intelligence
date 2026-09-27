import type { EscalationType } from "./constants";

export type LiveSentiment = "calm" | "concerned" | "frustrated" | "aggressive" | "escalating";
export type IssueFocus =
  | "refund_delay"
  | "pickup"
  | "qc_fail"
  | "wrong_item"
  | "timeline"
  | "ticket_status"
  | "human"
  | "amount"
  | "reference"
  | "status"
  | "general";

export type ConversationIntent = {
  sentiment: LiveSentiment;
  issueFocus: IssueFocus;
  wantsTicket: boolean;
  asksRepeatFacts: boolean;
  escalating: boolean;
  priorityBoost: number;
};

export function detectConversationIntent(text: string): ConversationIntent {
  const sentiment = detectSentiment(text);
  const issueFocus = detectIssueFocus(text);
  const escalating = sentiment === "escalating" || sentiment === "aggressive" || asksForEscalation(text);
  const wantsTicket =
    asksForEscalation(text) ||
    /\b(create|raise|open|make)\b.{0,20}\b(ticket|request|case)\b/i.test(text) ||
    /\b(ticket|request)\b.{0,12}\b(banao|bana do|karo|create)\b/i.test(text);
  const asksRepeatFacts =
    /\b(again|repeat|once more|tell me (the |my )?(reference|amount|days|status)|refund number|reference (number|id)|kitne din|kab start)\b/i.test(
      text,
    ) || /फिर से|दोबारा|रिफंड नंबर|कितने दिन/u.test(text);

  let priorityBoost = 0;
  if (sentiment === "concerned") priorityBoost += 6;
  if (sentiment === "frustrated") priorityBoost += 12;
  if (sentiment === "aggressive") priorityBoost += 18;
  if (sentiment === "escalating") priorityBoost += 22;
  if (issueFocus === "refund_delay" || issueFocus === "human") priorityBoost += 4;
  if (wantsTicket) priorityBoost += 5;

  return { sentiment, issueFocus, wantsTicket, asksRepeatFacts, escalating, priorityBoost };
}

export function detectSentiment(text: string): LiveSentiment {
  const lower = text.toLowerCase();
  if (
    /\b(fraud|cheat|cheating|lawsuit|consumer court|legal|useless|worst|idiot|scam|harassment)\b/i.test(lower) ||
    /\b(manager|supervisor|complaint|escalate now|raise (a )?complaint)\b/i.test(lower) ||
    /धोखा|बेकार|कंपलेंट|मैनेजर|कोर्ट/u.test(text)
  ) {
    return "escalating";
  }
  if (
    /\b(angry|furious|ridiculous|unacceptable|fed up|sick of|enough|shut up|stupid)\b/i.test(lower) ||
    /\b(this is (too )?late|still nothing|still waiting|every day|again and again)\b/i.test(lower) ||
    /गुस्सा|बहुत लेट|परेशान|हर बार|बकवास/u.test(text)
  ) {
    return "aggressive";
  }
  if (
    /\b(frustrated|annoyed|upset|disappointed|tired of|not happy|unhappy)\b/i.test(lower) ||
    /\b(still not|abhi tak nahi|nahi aaya|nahi mila|kitne din|kab aayega)\b/i.test(lower) ||
    /परेशान|निराश|अभी तक नहीं|कब आएगा/u.test(text)
  ) {
    return "frustrated";
  }
  if (
    /\b(worried|concerned|anxious|please help|urgent|asap|important)\b/i.test(lower) ||
    /चिंता|कृपया|जल्दी/u.test(text)
  ) {
    return "concerned";
  }
  return "calm";
}

export function detectIssueFocus(text: string): IssueFocus {
  if (asksForHuman(text)) return "human";
  if (/\b(ticket|case id|request id|raised|already (open|created|raised))\b/i.test(text) || /टिकट/u.test(text)) {
    return "ticket_status";
  }
  if (/\b(reference|rf-\d+|refund number|refund id)\b/i.test(text) || /रिफंड नंबर/u.test(text)) return "reference";
  if (/\b(amount|how much|₹|rupees|kitna)\b/i.test(text) || /कितना|राशि/u.test(text)) return "amount";
  if (
    /\b(when|timeline|how long|working days|kab|kitne din|arrive|aayega|aana)\b/i.test(text) ||
    /कब|कितने दिन|समय/u.test(text)
  ) {
    return "timeline";
  }
  if (/\b(pickup|courier|logistics|pick up)\b/i.test(text) || /पिकअप/u.test(text)) return "pickup";
  if (/\b(quality check|inspection|qc|tags? missing)\b/i.test(text) || /क्वालिटी|टैग/u.test(text)) return "qc_fail";
  if (/\b(wrong item|wrong product|galat)\b/i.test(text) || /गलत आइटम|गलत प्रोडक्ट/u.test(text)) return "wrong_item";
  if (/\b(refund|money|payment|paisa)\b/i.test(text) || /रिफंड|पैसे/u.test(text)) return "refund_delay";
  if (/\b(status|update|where|kahan)\b/i.test(text) || /स्थिति|स्टेटस|कहाँ/u.test(text)) return "status";
  return "general";
}

function asksForEscalation(text: string): boolean {
  return (
    /\b(escalate|escalation|supervisor|manager|complaint|raise (a )?(ticket|request|case)|open (a )?ticket)\b/i.test(
      text,
    ) || /एस्केलेट|कंपलेंट|टिकट बना/u.test(text)
  );
}

function asksForHuman(text: string): boolean {
  return (
    /\b(human agent|real person|live agent|customer care|representative|talk to (a |an |the )?(person|human|agent)|speak to (a |an |the )?(person|human|agent))\b/i.test(
      text,
    ) || /इंसान|व्यक्ति|कस्टमर केयर|मानव एजेंट/u.test(text)
  );
}

export function ticketLabel(type: EscalationType): { en: string; hi: string; hinglish: string } {
  if (type === "payment_support") {
    return { en: "payment support", hi: "पेमेंट सपोर्ट", hinglish: "payment support" };
  }
  if (type === "logistics") {
    return { en: "pickup support", hi: "पिकअप सपोर्ट", hinglish: "pickup support" };
  }
  return { en: "human review", hi: "मानव जाँच", hinglish: "human review" };
}
