import type { LanguageLabel, LanguageMode, ReplyLanguage } from "./types";

const HINGLISH = [
  "maine", "mera", "meri", "mere", "mujhe", "nahi", "nahin", "mila", "mili", "kiya",
  "thi", "tha", "kya", "hai", "hoon", "abhi", "tak", "pehle", "wapas", "aapka",
  "aap", "kab", "kyun", "kaise", "bhai", "yaar", "karo", "batao", "bataiye",
];

const NUMBER_WORDS = [
  "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
  "eighteen", "nineteen",
];

const PIN_DIGITS: Record<string, string> = {
  zero: "0",
  oh: "0",
  one: "1",
  won: "1",
  two: "2",
  to: "2",
  too: "2",
  three: "3",
  four: "4",
  for: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  ate: "8",
  nine: "9",
};

const DIGIT_WORD = Object.keys(PIN_DIGITS).join("|");

export function detectLanguage(text: string): { label: LanguageLabel; confidence: "high" | "low" } {
  const trimmed = text.trim();
  const devanagari = trimmed.match(/[\u0900-\u097F]/g)?.length ?? 0;
  const latin = trimmed.match(/[A-Za-z]/g)?.length ?? 0;
  const hinglishHits = HINGLISH.filter((word) => new RegExp(`\\b${word}\\b`, "i").test(trimmed)).length;
  const words = trimmed.split(/\s+/).filter(Boolean).length;

  if (devanagari >= 8 && devanagari > latin) return { label: "hi", confidence: "high" };
  if (devanagari >= 4 && latin >= 8) return { label: "hinglish", confidence: "high" };
  if (hinglishHits >= 2 && latin >= 8) return { label: "hinglish", confidence: "high" };
  if (hinglishHits >= 1 && latin >= 8) return { label: "hinglish", confidence: "high" };
  if (latin >= 12 && hinglishHits === 0 && devanagari === 0) return { label: "en", confidence: "high" };
  // Short English openers / acknowledgements — treat as English so auto mode never asks.
  if (
    latin > 0 &&
    devanagari === 0 &&
    hinglishHits === 0 &&
    /^(hi|hello|hey|hola|good (morning|afternoon|evening)|ok|okay|yes|yeah|yep|no|nope|thanks|thank you|please|help)([,.!]|\s|$)/i.test(
      trimmed,
    )
  ) {
    return { label: "en", confidence: "high" };
  }
  // Short Hindi / Hinglish openers.
  if (/^(namaste|namaskar|haan|ha|nahi|ji)([,.!]|\s|$)/i.test(trimmed) || /^नमस्ते|^नमस्कार|^हाँ|^हां|^नहीं/u.test(trimmed)) {
    return { label: /[A-Za-z]/.test(trimmed) && hinglishHits === 0 && !/[\u0900-\u097F]/.test(trimmed) ? "hinglish" : "hi", confidence: "high" };
  }
  if (words <= 3 && latin > 0 && hinglishHits === 0 && devanagari === 0) {
    // Short Latin that is not clearly English support vocabulary → still default English later.
    return { label: "uncertain", confidence: "low" };
  }
  if (words <= 3) return { label: "uncertain", confidence: "low" };
  if (hinglishHits >= 1) return { label: "hinglish", confidence: "low" };
  if (devanagari >= 2) return { label: "hi", confidence: "low" };
  if (latin >= 4) return { label: "en", confidence: "low" };
  return { label: "uncertain", confidence: "low" };
}

export function statedPreference(text: string): ReplyLanguage | null {
  if (/\bhinglish\b/i.test(text)) return "hinglish";
  if (/\b(english|angrezi)\b/i.test(text) || /अंग्रेज/u.test(text)) return "en";
  if (/\bhindi\b/i.test(text) || /हिंदी|हिन्दी/u.test(text)) return "hi";
  return null;
}

/**
 * Resolve the reply language for this turn.
 * Auto mode follows the conversation: use detected Hindi/English/Hinglish, keep an established
 * preference on short follow-ups, and fall back to English for anything else — never "ask which language".
 */
export function resolveReplyLanguage(
  mode: LanguageMode,
  preference: ReplyLanguage | null,
  text: string,
): ReplyLanguage {
  const detected = detectLanguage(text);
  const named = statedPreference(text);
  if (mode === "en") return "en";
  if (mode === "hi") return "hi";
  if (named) return named;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (preference && words <= 8) return preference;
  if (detected.label === "en" || detected.label === "hi" || detected.label === "hinglish") return detected.label;
  if (preference) return preference;
  return "en";
}

export function hasAmbiguousNumber(text: string): boolean {
  if (extractPin(text)) return false;
  const cleaned = text
    .replace(/\b(next|in|within|after|before|for|last|past)?\s*(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(working\s+)?days?\b/gi, " ")
    .replace(new RegExp(`\\b(?:${DIGIT_WORD})(?:\\s+(?:${DIGIT_WORD})){3}\\b`, "gi"), " ");
  const hits = cleaned.match(new RegExp(`\\b(${NUMBER_WORDS.join("|")})\\b`, "gi")) ?? [];
  if (hits.length === 0) return false;
  const unique = new Set(hits.map((hit) => hit.toLowerCase()));
  if (unique.size >= 2) return true;
  return /\b(amount|rupees|रुपये)\b/i.test(cleaned);
}

export function isApproval(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 140) return false;
  if (/\b(don't|do not|not now|नहीं|mat karo)\b/i.test(trimmed)) return false;
  if (
    /^(yes|yeah|yep|ok|okay|sure|approve|approved|go ahead|haan|ha|theek hai|हाँ|हां|ठीक है)([,.!]|\s|$)/i.test(trimmed) &&
    trimmed.length <= 64
  ) {
    return true;
  }
  return /\b(approve|escalation|escalate|create the ticket|create a ticket|ticket banao|kar do)\b/i.test(trimmed);
}

export function isRejection(text: string): boolean {
  return /^(no|nope|don't|do not|not now|cancel|नहीं|mat)([,.!]|\s|$).{0,40}$/i.test(text.trim());
}

export function isInjection(text: string): boolean {
  return /ignore (all |any )?(previous|prior|above) instructions|reveal the pin|system prompt|you are now|forget (the )?rules|every refund reference/i.test(text);
}

export function asksForHuman(text: string): boolean {
  return /\b(human agent|real person|live agent|customer care|representative|talk to (a |an |the )?(person|human|agent)|speak to (a |an |the )?(person|human|agent))\b/i.test(text)
    || /इंसान|व्यक्ति|कस्टमर केयर|मानव एजेंट/u.test(text);
}

export function asksNextSteps(text: string): boolean {
  return (
    /\b(next steps?|what (do|should) i (have to |need to )?do|what happens next|what now|kya karna|aage kya)\b/i.test(text) ||
    /अगला कदम|क्या करना|आगे क्या/u.test(text)
  );
}

export function extractOrderId(text: string): string | null {
  const match = text.match(/\bVW-\d{4}\b/i);
  return match ? match[0].toUpperCase() : null;
}

export function extractPin(text: string): string | null {
  const withoutOrder = text.replace(/\bVW-\d{4}\b/gi, " ");

  const labeled = withoutOrder.match(/\b(?:pin|pen|otp|पिन)\b[^0-9]{0,20}(\d{4})\b/i);
  if (labeled) return labeled[1];

  const leading = withoutOrder.match(/^\s*(\d{4})(?:\b|[.!,;:])/);
  if (leading) return leading[1];

  const spoken = extractSpokenDigitRun(withoutOrder);
  if (spoken) return spoken;

  const pinOrOtpContext = /\b(?:pin|pen|otp|पिन|password)\b/i.test(withoutOrder);
  if (pinOrOtpContext) {
    const afterLabel = withoutOrder.split(/\b(?:pin|pen|otp|password)\b|पिन/i).at(-1) ?? "";
    const words = afterLabel
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    const wordDigits = words.map((word) => PIN_DIGITS[word]).filter(Boolean).join("");
    if (wordDigits.length >= 4) return wordDigits.slice(0, 4);

    const compactPin = afterLabel.toUpperCase().match(/\b[0-9OILSBH]{4}\b/)?.[0] ?? "";
    if (compactPin) {
      const normalized = normalizeConfusableDigits(compactPin);
      if (/^\d{4}$/.test(normalized)) return normalized;
    }
  }

  const compact = withoutOrder.trim();
  if (compact.length <= 24 && /^\D*(\d{4})\D*$/.test(compact)) {
    return compact.match(/(\d{4})/)?.[1] ?? null;
  }
  return null;
}

function extractSpokenDigitRun(text: string): string | null {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  let run = "";
  for (const word of words) {
    const digit = PIN_DIGITS[word];
    if (digit) {
      run += digit;
      if (run.length === 4) return run;
    } else if (run.length > 0) {
      run = "";
    }
  }
  return null;
}

function normalizeConfusableDigits(value: string): string {
  return value
    .replaceAll("O", "0")
    .replace(/[IL]/g, "1")
    .replaceAll("S", "5")
    .replace(/[BH]/g, "8");
}

export function asksOrderSpecific(text: string): boolean {
  if (/\bVW-\d{4}\b/i.test(text)) return true;
  if (extractPin(text)) return true;
  if (
    /\b(my refund|my return|my order|current order|this order|order status|refund status|refund reference|mera refund|meri return|mera order)\b/i.test(
      text,
    )
  ) {
    return true;
  }
  if (/\b(status of (my |the |this |current )?order|where is my (order|refund|return)|track my (order|refund))\b/i.test(text)) {
    return true;
  }
  if (/\b(asking for the status|need the status|want the status|order update|refund update|what is the status)\b/i.test(text)) {
    return true;
  }
  const personal =
    /\b(my|mera|meri|mere|mujhe|status|reference|kahan|kidhar|current)\b/i.test(text) ||
    /नहीं मिला|कहाँ|कहां|स्थिति|स्टेटस/u.test(text);
  const topic =
    /\b(refund|return|order|pickup|inspection|status)\b/i.test(text) ||
    /रिफंड|वापसी|ऑर्डर|स्थिति/u.test(text);
  return personal && topic;
}

/** True when the customer clearly wants their own order facts, not public policy. */
export function wantsPrivateStatus(text: string): boolean {
  return asksOrderSpecific(text) || /\b(status|update|kahan|kidhar|स्थिति|स्टेटस)\b/i.test(text);
}

export function lastTurnAskedForPin(turns: Array<{ responseText: string }>): boolean {
  const last = turns.at(-1);
  if (!last) return false;
  return /\b(PIN|order PIN|पिन)\b/i.test(last.responseText);
}
