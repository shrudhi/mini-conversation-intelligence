const SWAPS: Array<[RegExp, string]> = [
  [/वापसी/gu, " return "],
  [/रिफंड/gu, " refund "],
  [/ऑर्डर/gu, " order "],
  [/पिन/gu, " pin "],
  [/नहीं/gu, " not "],
  [/मिला/gu, " received "],
  [/कहाँ|कहां/gu, " where "],
  [/मेरा|मेरी|मेरे/gu, " my "],
  [/\bmaine\b/gi, " I "],
  [/\bmera\b|\bmeri\b|\bmere\b|\bmujhe\b/gi, " my "],
  [/\bnahi\b|\bnahin\b/gi, " not "],
  [/\bmila\b|\bmili\b/gi, " received "],
  [/\babhi\b/gi, " still "],
  [/\btak\b/gi, " yet "],
  [/\bkya\b/gi, " what "],
  [/\bkahan\b|\bkidhar\b/gi, " where "],
  [/\bpehle\b/gi, " ago "],
  [/\bwapas\b/gi, " return "],
  [/\bpaise\b/gi, " refund "],
  [/\bkurta\b/gi, " kurta "],
  [/\bcod\b/gi, " cod "],
];

export function normalizeQuery(text: string): string {
  const preserved = text.match(/\bVW-\d{4}\b/gi)?.map((item) => item.toUpperCase()) ?? [];
  let query = ` ${text} `;
  for (const [pattern, replacement] of SWAPS) query = query.replace(pattern, replacement);
  query = query.replace(/[^\p{L}\p{N}\s-]/gu, " ");
  for (const orderId of preserved) {
    if (!query.toUpperCase().includes(orderId)) query += ` ${orderId}`;
  }
  return query.replace(/\s+/g, " ").trim();
}

export function facetQuery(input: {
  paymentMethod?: string | null;
  pickupStatus?: string | null;
  inspectionStatus?: string | null;
  finalSale?: boolean;
  issue?: string | null;
  offerEscalation?: boolean;
  needsPin?: boolean;
}): string {
  const parts: string[] = [];
  if (input.paymentMethod === "prepaid") parts.push("prepaid original");
  if (input.paymentMethod === "cod") parts.push("cod cash wallet");
  if (input.pickupStatus === "pending") parts.push("pickup pending logistics");
  if (input.inspectionStatus === "passed") parts.push("initiated hub");
  if (input.inspectionStatus === "failed") parts.push("failed missing");
  if (input.finalSale || input.issue === "wrong_item") parts.push("final innerwear wrong");
  if (input.issue === "unknown_status") parts.push("escalation ticket");
  if (input.offerEscalation) parts.push("escalation ticket approval");
  if (input.needsPin) parts.push("verify pin");
  return parts.join(" ");
}
