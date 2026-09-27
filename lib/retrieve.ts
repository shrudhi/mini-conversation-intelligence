import type { PolicyChunk } from "./types";
import { listPolicies } from "./cases";

/**
 * Lexical retrieval over versioned VelaWear policy chunks.
 * A documented alias hit adds 1000 so a specific rule outranks loose overlap.
 * At most three chunks are returned. Empty means nothing matched.
 *
 * Alias list:
 * - returnable, unworn, calendar, accessories -> RET-01
 * - final, innerwear, wrong, damaged, non-returnable -> RET-02
 * - pickup, logistics, pending -> RET-03
 * - hub, initiated -> RET-04
 * - failed, fails, missing -> RET-05
 * - prepaid, original -> PAY-01
 * - cod, wallet, cash -> PAY-02
 * - pin, otp, password, verify, verification -> SEC-01
 * - confidential, cross, privacy, guardrail -> SEC-02
 * - priority, repeat, frustrated, history -> CX-01
 * - ticket, approval, idempotency, escalation -> ACT-01
 */

const BOOSTS: Array<{ id: string; terms: string[] }> = [
  { id: "RET-01", terms: ["returnable", "unworn", "calendar", "accessories"] },
  { id: "RET-02", terms: ["final", "innerwear", "wrong", "damaged", "non-returnable"] },
  { id: "RET-03", terms: ["pickup", "logistics", "pending"] },
  { id: "RET-04", terms: ["hub", "initiated"] },
  { id: "RET-05", terms: ["failed", "fails", "missing"] },
  { id: "PAY-01", terms: ["prepaid", "original"] },
  { id: "PAY-02", terms: ["cod", "wallet", "cash"] },
  { id: "SEC-01", terms: ["pin", "otp", "password", "verify", "verification"] },
  { id: "SEC-02", terms: ["confidential", "cross", "privacy", "guardrail"] },
  { id: "CX-01", terms: ["priority", "repeat", "frustrated", "history"] },
  { id: "ACT-01", terms: ["ticket", "approval", "idempotency", "escalation"] },
];

const STOPWORDS = new Set([
  "a", "an", "the", "after", "is", "it", "to", "of", "and", "or", "not", "must", "with",
  "for", "this", "be", "on", "in", "if", "by", "than", "more", "does", "has", "been",
  "without", "that", "we", "you", "your", "i", "my", "me", "do", "will", "just", "there",
  "no", "so", "as", "at", "from", "its", "can", "what", "how", "please", "hello", "thank",
  "thanks", "am", "are", "was", "were", "have", "had", "but", "about", "into", "over",
  "within", "before", "when", "which", "who", "where",
]);

export type RankedPolicy = PolicyChunk & { score: number; quote: string };

export function tokenize(text: string): string[] {
  const normalized = text.toLowerCase().replace(/[–—]/g, " ");
  const parts = normalized.match(/[a-z0-9]+/g) ?? [];
  return parts.filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

function quoteOf(policy: PolicyChunk): string {
  const sentence = policy.text.split(". ")[0];
  return sentence.endsWith(".") ? sentence : `${sentence}.`;
}

export function rankPolicies(query: string, source: PolicyChunk[] = listPolicies()): RankedPolicy[] {
  const queryTokens = tokenize(query);
  const querySet = new Set(queryTokens);
  const ranked: RankedPolicy[] = [];

  for (const policy of source) {
    const policyTokens = new Set(tokenize(`${policy.text} ${policy.topic} ${policy.applies_to.join(" ")}`));
    let overlap = 0;
    for (const token of policyTokens) {
      if (querySet.has(token)) overlap += 1;
    }
    const boost = BOOSTS.find((item) => item.id === policy.id);
    const boosted = boost?.terms.some((term) => querySet.has(term) || query.toLowerCase().includes(term)) ?? false;
    if (!boosted && overlap === 0) continue;
    ranked.push({
      ...policy,
      quote: quoteOf(policy),
      score: (boosted ? 1000 : 0) + overlap,
    });
  }

  ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return ranked;
}

export function retrievePolicies(query: string, source: PolicyChunk[] = listPolicies()): RankedPolicy[] {
  return rankPolicies(query, source).slice(0, 3);
}
