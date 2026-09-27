import type { AgentStyleSettings } from "./agent-settings";
import type { CriterionId, EscalationType } from "./constants";


export type LanguageMode = "en" | "hi" | "auto";
export type ReplyLanguage = "en" | "hi" | "hinglish";
export type LanguageLabel = ReplyLanguage | "uncertain";
export type QaStatus = "pass" | "partial" | "fail" | "not_assessable" | "not_applicable";
export type PaymentMethod = "prepaid" | "cod";

export type PolicyChunk = {
  id: string;
  version: string;
  topic: string;
  applies_to: string[];
  text: string;
};

export type CaseRecord = {
  alias: string;
  orderId: string;
  customerId: string;
  pin: string;
  product: string;
  productId: string;
  amountInr: number;
  paymentMethod: PaymentMethod;
  finalSale: boolean;
  issue: string;
  caseState: string;
  priorContacts: number;
  situation: string;
  returnRequest: {
    accepted: boolean | null;
    pickupStatus: "pending" | "picked" | "not_applicable" | "unknown";
    pickupWorkingDaysElapsed: number | null;
    inspectionStatus: "passed" | "failed" | "pending" | "unknown" | "not_started";
    inspectionReason: string | null;
  };
  refund: {
    initiated: boolean | null;
    reference: string | null;
    workingDaysSinceInitiation: number | null;
    received: boolean | null;
    destination: "original_payment" | "bank_transfer" | "wallet" | null;
  };
};

export type ToolFact = Record<string, string | number | boolean | null>;

export type ToolCall = {
  name: "get_order" | "get_return" | "get_refund";
  available: boolean;
  reason: string | null;
  facts: ToolFact | null;
};

export type Citation = {
  policyId: string;
  version: string;
  quote: string;
};

export type RetrievedPolicy = PolicyChunk & { score: number; quote: string };

export type SpeechTrace = {
  status: "not_requested" | "muted" | "generated" | "error" | "not_configured";
  voice: string | null;
  latencyMs: number | null;
  playback: "not_played" | "played" | "error" | null;
};

export type ConversationTurn = {
  id: string;
  at: string;
  customerText: string;
  corrected: boolean;
  originalTranscript: string | null;
  stt: {
    latencyMs: number | null;
    durationSeconds: number | null;
    format: string | null;
    detectedLanguages: string[];
  } | null;
  language: LanguageLabel;
  normalizedQuery: string;
  retrievalMs: number;
  retrieved: RetrievedPolicy[];
  tools: ToolCall[];
  verified: boolean;
  disclosed: boolean;
  responseText: string;
  responseSource: "template" | "model";
  citations: Citation[];
  uncertainties: string[];
  proposedAction: EscalationType | null;
  approval: { approved: boolean; at: string } | null;
  ticket: { ticketId: string; created: boolean; type: EscalationType } | null;
  speech: SpeechTrace;
  latency: {
    stt: number | null;
    retrieval: number;
    model: number | null;
    tts: number | null;
    total: number | null;
  };
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    audioSeconds: number | null;
  };
  constraints: {
    allowedReferences: string[];
    allowedAmounts: number[];
    allowedDayCounts: number[];
  };
};

export type ConversationState = {
  languageMode: LanguageMode;
  languagePreference: ReplyLanguage | null;
  selectedOrderId: string | null;
  scenarioId: string | null;
  verifiedOrderId: string | null;
  pendingAction: EscalationType | null;
  ticketId: string | null;
  ticketType: EscalationType | null;
  toolFailure: boolean;
  liveSentiment: string | null;
  liveIssueFocus: string | null;
  livePriorityBoost: number;
  turns: ConversationTurn[];
};

export type PersistedSession = ConversationState & {
  id: string;
  createdAt: string;
  updatedAt: string;
  ended: boolean;
  source: "live" | "simulated";
  customerId?: string | null;
  /** Frozen PM style settings for this conversation only. */
  agentStyle?: AgentStyleSettings | null;
};

export type FeedbackSatisfaction = "yes" | "no";
export type FeedbackResolution = "yes" | "partly" | "no";
export type FeedbackStatus = "submitted" | "skipped";

export type ConversationFeedback = {
  id: string;
  sessionId: string;
  customerId: string | null;
  orderId: string | null;
  createdAt: string;
  updatedAt: string;
  status: FeedbackStatus;
  satisfied: FeedbackSatisfaction | null;
  resolved: FeedbackResolution | null;
  comment: string | null;
};

export type PastConversationEntry = {
  sessionId: string | null;
  customerId: string;
  orderId: string | null;
  productName: string | null;
  productId: string | null;
  issue: string | null;
  priority: string | null;
  status: string | null;
  resolution: string | null;
  nextAction: string | null;
  ticketId: string | null;
  when: string;
  channel: string;
  summary: string;
  outcome: string;
  savedAt: string;
  transcript: Array<{ role: "customer" | "agent"; text: string; at: string }>;
  actions: string[];
  feedback: {
    status: "submitted" | "skipped" | "none";
    satisfied: string | null;
    resolved: string | null;
    comment: string | null;
  } | null;
  readOnly: true;
};

export type FixturePastConversation = {
  when: string;
  channel: string;
  summary: string;
  outcome: string;
  orderId?: string | null;
  productName?: string | null;
  productId?: string | null;
  issue?: string | null;
  priority?: string | null;
  status?: string | null;
  resolution?: string | null;
  nextAction?: string | null;
  ticketId?: string | null;
  transcript?: Array<{ role: "customer" | "agent"; text: string; at: string }>;
  actions?: string[];
  feedback?: PastConversationEntry["feedback"];
};

export type ScoreView = {
  headline: number | null;
  label: "score" | "no_score" | "incomplete" | "needs_review";
  coverage: number | null;
  assessedWeight: number;
  applicableWeight: number;
  reason: string;
};

export type CriterionResult = {
  criterion: CriterionId;
  status: QaStatus;
  weight: number;
  rationale: string;
  evidence: Array<{ label: string; quote: string }>;
  source: "deterministic" | "ai_judge" | "human";
};

export type MockTicket = {
  ticket_id: string;
  order_id: string;
  case_alias: string;
  type: EscalationType;
  destination: string;
  status: "open" | "created_mock";
  idempotency_key: string;
  created_at: string;
};

export type UsageView = {
  inputTokens: number;
  outputTokens: number;
  audioSeconds: number;
};

export type EvalRun = {
  id: string;
  sessionId: string;
  scenarioId: string | null;
  source: "live" | "simulated";
  createdAt: string;
  policyVersion: string;
  rubricVersion: string;
  models: { agent: string | null; transcription: string | null; tts: string | null };
  score: ScoreView;
  originalScore: ScoreView;
  criteria: CriterionResult[];
  failureStage: string | null;
  uncertainties: string[];
  humanNote: string | null;
  pronunciationNote: string | null;
  aiJudge: boolean;
  handoffOffered: boolean;
  latencyMs: number | null;
  usage: UsageView;
};

export type LimitStatus = {
  liveAvailable: boolean;
  agentModel: string;
  transcriptionModel: string;
  ttsModel: string;
  ttsVoice: string;
  policyVersion: string;
  rubricVersion: string;
  agentUsed: number;
  agentMax: number;
  transcriptionUsed: number;
  transcriptionMax: number;
  speechUsed: number;
  speechMax: number;
  inFlight: boolean;
};
