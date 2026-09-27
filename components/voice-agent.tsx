"use client";

import { useEffect, useRef, useState } from "react";
import { FeedbackModal } from "@/components/feedback-modal";
import { AGENT_AVATAR_SRC, customerAvatarSrc } from "@/lib/avatars";
import { outcomeFromConversation } from "@/lib/conversation-outcome";
import { formatSentimentLabel } from "@/lib/intent";

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: response.ok ? "Unexpected response from the server." : "The server could not process that request." };
  }
}

async function readAgentTurnEvents(
  response: Response,
  onReply: (payload: Record<string, unknown>) => void,
  onSpeech: (payload: Record<string, unknown>) => Promise<void> | void,
): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("ndjson") || !response.body) {
    const payload = await readJsonResponse(response);
    onReply(payload);
    return payload;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let replyPayload: Record<string, unknown> | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (event.type === "reply" || (!event.type && typeof event.reply === "string")) {
        replyPayload = event;
        onReply(event);
      } else if (event.type === "speech") {
        await onSpeech(event);
      } else if (event.type === "speech_error" && typeof event.error === "string") {
        // Speech failed after text — keep the reply and surface the audio error separately in onSpeech path.
        await onSpeech(event);
      }
    }
  }

  if (buffer.trim()) {
    try {
      const event = JSON.parse(buffer.trim()) as Record<string, unknown>;
      if (event.type === "reply" || (!event.type && typeof event.reply === "string")) {
        replyPayload = event;
        onReply(event);
      } else if (event.type === "speech" || event.type === "speech_error") {
        await onSpeech(event);
      }
    } catch {
      /* ignore trailing junk */
    }
  }

  return replyPayload ?? {};
}

type Priority = {
  level: "P1" | "P2" | "P3";
  score: number;
  label: string;
  reasons: string[];
  recommendedNextStep: string;
  decisionHint: string;
  sentiment?: string;
  issueFocus?: string;
};

type AgentTurnPayload = {
  error?: string;
  sessionId?: string;
  turnId?: string;
  reply?: string;
  simulated?: boolean;
  pendingApproval?: string | null;
  ticket?: { type?: string; ticketId?: string; created?: boolean } | null;
  ticketId?: string | null;
  ticketType?: string | null;
  liveSentiment?: string | null;
  liveIssueFocus?: string | null;
  livePriority?: Priority | null;
  session?: Record<string, unknown>;
};

type PastConversation = {
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

type WorkspaceCard = {
  customerId: string;
  customerName: string;
  avatarUrl?: string;
  city: string;
  segment: string;
  behavior: string;
  preferredLanguage: string;
  escalationLevel: number;
  memberSince: string;
  pastIssues: Array<{ orderId: string; type: string; outcome: string; when: string }>;
  pastConversations: PastConversation[];
  orderId: string;
  pin: string;
  product: string;
  productId: string;
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
  priority: Priority;
  amountLabel: string;
  lastSessionSavedAt?: string | null;
};

type CustomerOption = {
  customerId: string;
  name: string;
  city: string;
  segment: string;
  orderIds: string[];
  preferredLanguage: string;
};

type Status = {
  liveAvailable: boolean;
  agentModel: string;
  transcriptionModel: string;
  ttsModel: string;
  policyVersion: string;
  agentUsed: number;
  agentMax: number;
  transcriptionUsed: number;
  transcriptionMax: number;
  speechUsed: number;
  speechMax: number;
  customers: CustomerOption[];
  cards: WorkspaceCard[];
};

type ChatMessage = { id: string; role: "customer" | "agent"; text: string; simulated?: boolean };
type Phase = "idle" | "recording" | "transcribing" | "review";
type Outcome = { nextStep: string; decision: string; priorityNote: string };

export function VoiceAgent({
  onOpenDashboard,
  bootstrap = null,
  onSignOut,
}: {
  onOpenDashboard: (sessionId: string) => void;
  bootstrap?: { customerId: string; orderId: string } | null;
  onSignOut?: () => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [customerId, setCustomerId] = useState("CUST-1001");
  const [orderId, setOrderId] = useState("VW-1001");
  const [card, setCard] = useState<WorkspaceCard | null>(null);
  const [languageMode, setLanguageMode] = useState<"en" | "hi" | "auto">("auto");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionSnapshot, setSessionSnapshot] = useState<Record<string, unknown> | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [originalTranscript, setOriginalTranscript] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [format, setFormat] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [ticketType, setTicketType] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [turnCount, setTurnCount] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [conversationEnded, setConversationEnded] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackConfirmation, setFeedbackConfirmation] = useState<string | null>(null);
  const [feedbackRecorded, setFeedbackRecorded] = useState<"none" | "submitted" | "skipped">("none");
  const [savedAtLabel, setSavedAtLabel] = useState<string | null>(null);
  const [archiveEntry, setArchiveEntry] = useState<PastConversation | null>(null);
  const feedbackLockRef = useRef(false);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const speechGenerationRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRef = useRef(false);
  const autoSendAfterRecordRef = useRef(false);
  const phaseRef = useRef<Phase>("idle");
  const timerRef = useRef<number | null>(null);
  const secondsRef = useRef(0);
  const sttRef = useRef<{ latencyMs: number; durationSeconds: number | null; format: string | null; detectedLanguages: string[] } | null>(null);

  function setPhaseSafe(next: Phase) {
    phaseRef.current = next;
    setPhase(next);
  }

  useEffect(() => {
    void fetch("/api/status")
      .then((response) => response.json())
      .then((payload: Status) => setStatus(payload))
      .catch(() => setError("The local status check did not finish."));
  }, []);

  useEffect(() => {
    void fetch("/api/settings")
      .then((response) => response.json())
      .then((payload: { settings?: { languageMode?: "en" | "hi" | "auto" } }) => {
        const mode = payload.settings?.languageMode;
        if (mode === "en" || mode === "hi" || mode === "auto") setLanguageMode(mode);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!bootstrap?.customerId || !bootstrap.orderId) return;
    if (signedIn && card?.customerId === bootstrap.customerId && card.orderId === bootstrap.orderId) return;
    setCustomerId(bootstrap.customerId);
    setOrderId(bootstrap.orderId);
    void signIn(bootstrap.customerId, bootstrap.orderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrap?.customerId, bootstrap?.orderId]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const livePriority = card
    ? outcomeFromConversation({
        verified: true,
        ticketId,
        ticketType,
        pendingAction: pending,
        turnCount,
        priority: card.priority,
      })
    : null;

  async function signIn(nextCustomerId = customerId, nextOrderId = orderId) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: nextCustomerId, orderId: nextOrderId }),
      });
      const payload = (await response.json()) as { error?: string; card?: WorkspaceCard };
      if (!response.ok || !payload.card) {
        setError(payload.error || "Sign-in failed.");
        return;
      }
      setCustomerId(payload.card.customerId);
      setOrderId(payload.card.orderId);
      setCard(payload.card);
      // Language for new chats comes from PM Agent settings (loaded separately), not customer preference.
      setSignedIn(true);
      resetConversation(false);
      setVerified(true);
      setOutcome(null);
    } catch {
      setError("Sign-in did not finish.");
    } finally {
      setBusy(false);
    }
  }

  function resetConversation(clearCard: boolean) {
    setSessionId(null);
    setSessionSnapshot(null);
    setMessages([]);
    setDraft("");
    setOriginalTranscript(null);
    setPending(null);
    setTicketType(null);
    setTicketId(null);
    setVerified(false);
    setTurnCount(0);
    setPhaseSafe("idle");
    setConversationEnded(false);
    setFeedbackOpen(false);
    setFeedbackBusy(false);
    setFeedbackError(null);
    setFeedbackConfirmation(null);
    setFeedbackRecorded("none");
    setSavedAtLabel(null);
    feedbackLockRef.current = false;
    if (clearCard) setCard(null);
    // Pick up latest PM language defaults for the next conversation only.
    void fetch("/api/settings")
      .then((response) => response.json())
      .then((payload: { settings?: { languageMode?: "en" | "hi" | "auto" } }) => {
        const mode = payload.settings?.languageMode;
        if (mode === "en" || mode === "hi" || mode === "auto") setLanguageMode(mode);
      })
      .catch(() => undefined);
  }

  function signOut() {
    setSignedIn(false);
    resetConversation(true);
    setOutcome(null);
    onSignOut?.();
  }

  function stopAgentSpeech() {
    speechGenerationRef.current += 1;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }

  async function startRecording() {
    setError(null);
    discardRef.current = false;
    autoSendAfterRecordRef.current = false;
    stopAgentSpeech();
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser does not expose a microphone. You can still type a message and send it.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferred = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const mime = preferred.find((item) => MediaRecorder.isTypeSupported(item)) ?? "";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      let stopped = false;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        stream.getTracks().forEach((track) => track.stop());
        if (timerRef.current) window.clearInterval(timerRef.current);
        recorderRef.current = null;
        setPhaseSafe("idle");
        setSeconds(0);
        setError("Recording failed in this browser. Type your message and send it instead.");
      };
      recorder.onstop = () => {
        if (stopped) return;
        stopped = true;
        stream.getTracks().forEach((track) => track.stop());
        if (timerRef.current) window.clearInterval(timerRef.current);
        recorderRef.current = null;
        const mimeType = recorder.mimeType || mime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        if (discardRef.current) {
          autoSendAfterRecordRef.current = false;
          setPhaseSafe("idle");
          setSeconds(0);
          return;
        }
        if (blob.size < 256) {
          setPhaseSafe("idle");
          setSeconds(0);
          setError("The recording was empty. Hold the mic for a moment, then tap Send — or type the message.");
          return;
        }
        const hitLimit = secondsRef.current >= 59;
        autoSendAfterRecordRef.current = true;
        void transcribe(blob, mimeType, hitLimit);
      };
      recorderRef.current = recorder;
      // Timeslice keeps chunks flowing so stop() always has audio to send.
      recorder.start(250);
      setFormat(recorder.mimeType || mime || "audio/webm");
      setPhaseSafe("recording");
      setSeconds(0);
      secondsRef.current = 0;
      timerRef.current = window.setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
        if (secondsRef.current >= 59) {
          autoSendAfterRecordRef.current = true;
          stopRecording();
        }
      }, 1000);
    } catch {
      setError("Microphone permission was blocked. You can type the message instead.");
    }
  }

  function stopRecording() {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const recorder = recorderRef.current;
    if (!recorder) {
      if (phaseRef.current === "recording") {
        setPhaseSafe("idle");
        setError("Recording stopped unexpectedly. Tap the microphone and try again.");
      }
      return;
    }
    if (recorder.state === "inactive") {
      recorderRef.current = null;
      if (phaseRef.current === "recording") {
        setPhaseSafe("idle");
        setError("Recording stopped unexpectedly. Tap the microphone and try again.");
      }
      return;
    }
    try {
      if (recorder.state === "recording") recorder.requestData();
    } catch {
      // Some browsers throw if requestData is called at the wrong time; stop() still works.
    }
    try {
      recorder.stop();
    } catch {
      recorderRef.current = null;
      setPhaseSafe("idle");
      setError("Could not stop the recorder. Type your message and send it instead.");
    }
  }

  function cancelRecording() {
    discardRef.current = true;
    autoSendAfterRecordRef.current = false;
    stopRecording();
    setDraft("");
    setOriginalTranscript(null);
    sttRef.current = null;
    setPhaseSafe("idle");
    setSeconds(0);
    setError(null);
  }

  function finishVoiceAndSend() {
    if (phaseRef.current !== "recording" && phase !== "recording") return;
    discardRef.current = false;
    autoSendAfterRecordRef.current = true;
    setError(null);
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      recorderRef.current = null;
      setPhaseSafe("idle");
      setError("Recording was not active. Tap the microphone and try again.");
      return;
    }
    // Immediate UI feedback — MediaRecorder.onstop is async and can look like a no-op.
    setPhaseSafe("transcribing");
    stopRecording();
  }

  async function transcribe(blob: Blob, mime: string, hitLimit: boolean) {
    setPhaseSafe("transcribing");
    const extension = mime.includes("mp4") ? "m4a" : "webm";
    const file = new File([blob], `turn.${extension}`, { type: mime });
    const form = new FormData();
    form.set("file", file);
    form.set("language", languageMode);
    // MediaRecorder webm/mp4 often has no duration metadata — send the mic timer length.
    form.set("durationSeconds", String(Math.max(1, secondsRef.current || 1)));
    const started = Date.now();
    const shouldAutoSend = autoSendAfterRecordRef.current;
    autoSendAfterRecordRef.current = false;
    try {
      const response = await fetch("/api/transcribe", { method: "POST", body: form });
      const payload = (await response.json()) as {
        text?: string;
        error?: string;
        languages?: string[];
        durationSeconds?: number;
        format?: string;
        latencyMs?: number;
      };
      if (!response.ok || !payload.text) {
        setError(payload.error || "Transcription did not return text. You can type the message and send it.");
        setDraft("");
        setPhaseSafe("idle");
        return;
      }
      sttRef.current = {
        latencyMs: payload.latencyMs ?? Date.now() - started,
        durationSeconds: payload.durationSeconds ?? null,
        format: payload.format ?? extension,
        detectedLanguages: payload.languages ?? [],
      };
      setOriginalTranscript(payload.text);
      if (shouldAutoSend) {
        setDraft("");
        setPhaseSafe("idle");
        if (hitLimit) {
          setError("Recording reached 60 seconds and was sent automatically.");
        } else {
          setError(null);
        }
        await sendMessage(payload.text, payload.text);
        return;
      }
      setDraft(payload.text);
      setPhaseSafe("idle");
      draftRef.current?.focus();
    } catch {
      setError("Transcription did not finish. You can type the message and send it.");
      setPhaseSafe("idle");
    }
  }

  async function sendDraft() {
    await sendMessage(draft.trim());
  }

  async function sendMessage(text: string, originalFromVoice: string | null = null) {
    if (!text || busy || !card) return;
    // Typed send must not run while recording/transcribing; voice auto-send runs right after STT.
    if (!originalFromVoice && (phase === "recording" || phase === "transcribing")) return;
    stopAgentSpeech();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/agent-turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          session: sessionSnapshot,
          text,
          languageMode,
          orderId: card.orderId,
          customerId: card.customerId,
          muted,
          corrected: Boolean(
            originalFromVoice
              ? false
              : originalTranscript && originalTranscript !== text,
          ),
          originalTranscript: originalFromVoice ?? originalTranscript,
          stt: sttRef.current,
        }),
      });

      let speechHandled = false;
      const payload = await readAgentTurnEvents(
        response,
        (event) => {
          if (!response.ok || !event.reply || !event.sessionId) return;
          applyAgentReply(event as AgentTurnPayload, text, originalFromVoice);
        },
        async (event) => {
          if (event.error && !event.audioBase64) {
            setError(String(event.error));
            return;
          }
          if (typeof event.audioBase64 === "string" && event.sessionId && event.turnId) {
            speechHandled = true;
            if (event.session && typeof event.session === "object") {
              setSessionSnapshot(event.session as Record<string, unknown>);
            }
            await playAudioBase64(String(event.audioBase64), String(event.contentType || "audio/mpeg"), {
              sessionId: String(event.sessionId),
              turnId: String(event.turnId),
              session: (event.session as Record<string, unknown> | undefined) ?? sessionSnapshot,
            });
          }
        },
      );

      if (!response.ok || !payload.reply || !payload.sessionId) {
        setError((payload.error as string) || "The agent did not reply.");
        if (originalFromVoice) setDraft(originalFromVoice);
        return;
      }

      if (!speechHandled && !muted && payload.turnId) {
        await playSpeech(String(payload.sessionId), String(payload.turnId), (payload.session as Record<string, unknown> | undefined) ?? sessionSnapshot);
      } else if (!speechHandled && muted && payload.turnId) {
        await fetch("/api/speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: payload.sessionId,
            turnId: payload.turnId,
            muted: true,
            session: payload.session ?? sessionSnapshot,
          }),
        });
      }
    } catch {
      setError("The message was not sent.");
      if (originalFromVoice) setDraft(originalFromVoice);
    } finally {
      setBusy(false);
    }
  }

  function applyAgentReply(payload: AgentTurnPayload, text: string, originalFromVoice: string | null) {
    setSessionId(payload.sessionId!);
    if (payload.session) setSessionSnapshot(payload.session);
    setMessages((current) => [
      ...current,
      { id: `c-${current.length}`, role: "customer", text },
      { id: `a-${current.length}`, role: "agent", text: payload.reply || "", simulated: payload.simulated },
    ]);
    setTurnCount((count) => count + 1);
    setPending(payload.pendingApproval ?? null);
    if (payload.ticketType) setTicketType(payload.ticketType);
    if (payload.ticketId) setTicketId(payload.ticketId);
    if (payload.ticket?.type) setTicketType(payload.ticket.type);
    if (payload.ticket?.ticketId) setTicketId(payload.ticket.ticketId);
    if (payload.livePriority && card) {
      setCard({
        ...card,
        priority: {
          ...payload.livePriority,
          sentiment: payload.liveSentiment ?? payload.livePriority.sentiment,
          issueFocus: payload.liveIssueFocus ?? payload.livePriority.issueFocus,
        },
        behavior:
          payload.liveSentiment === "aggressive" || payload.liveSentiment === "escalating"
            ? "frustrated"
            : payload.liveSentiment === "frustrated"
              ? "frustrated"
              : payload.liveSentiment === "concerned"
                ? "anxious"
                : card.behavior,
      });
    } else if (payload.liveSentiment && card) {
      setCard({
        ...card,
        priority: {
          ...card.priority,
          sentiment: payload.liveSentiment,
          issueFocus: payload.liveIssueFocus ?? card.priority.issueFocus,
        },
        behavior:
          payload.liveSentiment === "aggressive" || payload.liveSentiment === "escalating"
            ? "frustrated"
            : payload.liveSentiment === "frustrated"
              ? "frustrated"
              : payload.liveSentiment === "concerned"
                ? "anxious"
                : card.behavior,
      });
    }
    if (/\bPIN\b|पिन/i.test(text) && !/does not match|not match/i.test(payload.reply || "")) {
      setVerified(true);
    }
    if (/RF-\d+/i.test(payload.reply || "") || /quality check|pickup|final sale|human review|ticket/i.test(payload.reply || "")) {
      setVerified(true);
    }
    setDraft("");
    setOriginalTranscript(null);
    sttRef.current = null;
    setPhaseSafe("idle");
    void originalFromVoice;
  }

  async function playAudioBase64(
    audioBase64: string,
    contentType: string,
    meta: { sessionId: string; turnId: string; session: Record<string, unknown> | null },
  ) {
    const generation = speechGenerationRef.current;
    const bytes = Uint8Array.from(atob(audioBase64), (char) => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: contentType || "audio/mpeg" }));
    setAudioUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return url;
    });
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = url;
    try {
      if (generation !== speechGenerationRef.current) return;
      await audio.play();
      if (generation !== speechGenerationRef.current) {
        audio.pause();
        audio.currentTime = 0;
        return;
      }
      await fetch("/api/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: meta.sessionId,
          turnId: meta.turnId,
          playback: "played",
          session: meta.session,
        }),
      });
    } catch {
      await fetch("/api/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: meta.sessionId,
          turnId: meta.turnId,
          playback: "error",
          session: meta.session,
        }),
      });
    }
  }

  async function playSpeech(
    activeSession: string,
    turnId: string,
    sessionForSpeech: Record<string, unknown> | null = sessionSnapshot,
  ) {
    const generation = speechGenerationRef.current;
    const response = await fetch("/api/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: activeSession, turnId, session: sessionForSpeech }),
    });
    if (generation !== speechGenerationRef.current) return;
    const payload = (await readJsonResponse(response)) as {
      error?: string;
      audioBase64?: string;
      contentType?: string;
      session?: Record<string, unknown>;
    };
    if (!response.ok || !payload.audioBase64) {
      setError(payload.error || "Speech was not generated.");
      return;
    }
    if (payload.session) setSessionSnapshot(payload.session);
    if (generation !== speechGenerationRef.current) return;
    const bytes = Uint8Array.from(atob(payload.audioBase64), (char) => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: payload.contentType || "audio/mpeg" }));
    setAudioUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return url;
    });
    const audio = audioRef.current;
    if (audio) {
      audio.src = url;
      try {
        if (generation !== speechGenerationRef.current) return;
        await audio.play();
        if (generation !== speechGenerationRef.current) {
          audio.pause();
          audio.currentTime = 0;
          return;
        }
        await fetch("/api/speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: activeSession,
            turnId,
            playback: "played",
            session: payload.session ?? sessionForSpeech,
          }),
        });
      } catch {
        await fetch("/api/speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: activeSession,
            turnId,
            playback: "error",
            session: payload.session ?? sessionForSpeech,
          }),
        });
      }
    }
  }

  async function decide(approved: boolean) {
    if (!sessionId || busy) return;
    stopAgentSpeech();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/escalate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, approved, session: sessionSnapshot }),
      });
      const payload = (await readJsonResponse(response)) as {
        error?: string;
        reply?: string;
        pendingApproval?: string | null;
        simulated?: boolean;
        ticket?: { type?: string; ticketId?: string; created?: boolean } | null;
        session?: Record<string, unknown>;
      };
      if (!response.ok || !payload.reply) {
        setError(payload.error || "The escalation was not created.");
        return;
      }
      if (payload.session) setSessionSnapshot(payload.session);
      setMessages((current) => [
        ...current,
        { id: `c-${current.length}`, role: "customer", text: approved ? "Yes, please create the ticket." : "Not now" },
        { id: `a-${current.length}`, role: "agent", text: payload.reply || "", simulated: payload.simulated },
      ]);
      setTurnCount((count) => count + 1);
      setPending(payload.pendingApproval ?? null);
      if (payload.ticket?.type) setTicketType(payload.ticket.type);
      if (payload.ticket?.ticketId) setTicketId(payload.ticket.ticketId);
    } catch {
      setError("The escalation request did not finish.");
    } finally {
      setBusy(false);
    }
  }

  async function endConversation() {
    if (!sessionId || busy || !card || conversationEnded) return;
    stopAgentSpeech();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, customerId: card.customerId, session: sessionSnapshot }),
      });
      const payload = (await readJsonResponse(response)) as {
        error?: string;
        card?: WorkspaceCard;
        savedAt?: string;
      };
      if (!response.ok) {
        setError(payload.error || "The conversation could not be saved.");
        return;
      }
      setConversationEnded(true);
      setPending(null);
      setSavedAtLabel(formatClock(payload.savedAt ?? new Date().toISOString()));
      setOutcome(
        outcomeFromConversation({
          verified: true,
          ticketId,
          ticketType,
          pendingAction: null,
          turnCount,
          priority: card.priority,
        }),
      );
      if (payload.card) setCard(payload.card);
      setFeedbackOpen(true);
      setFeedbackConfirmation(null);
      setFeedbackError(null);
      setFeedbackRecorded("none");
      feedbackLockRef.current = false;
    } catch {
      setError("The conversation could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function submitFeedback(input: { satisfied: "yes" | "no"; resolved: "yes" | "partly" | "no"; comment: string }) {
    if (!sessionId || !card || feedbackLockRef.current) return;
    feedbackLockRef.current = true;
    setFeedbackBusy(true);
    setFeedbackError(null);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          customerId: card.customerId,
          session: sessionSnapshot,
          satisfied: input.satisfied,
          resolved: input.resolved,
          comment: input.comment,
        }),
      });
      const payload = (await readJsonResponse(response)) as { error?: string; card?: WorkspaceCard };
      if (!response.ok) {
        setFeedbackError(payload.error || "Feedback could not be saved.");
        feedbackLockRef.current = false;
        return;
      }
      if (payload.card) setCard(payload.card);
      setFeedbackRecorded("submitted");
      setFeedbackConfirmation("Thanks — your feedback was saved for this conversation.");
    } catch {
      setFeedbackError("Feedback could not be saved. Please try again.");
      feedbackLockRef.current = false;
    } finally {
      setFeedbackBusy(false);
    }
  }

  async function skipFeedback() {
    if (!sessionId || !card || feedbackLockRef.current) return;
    feedbackLockRef.current = true;
    setFeedbackBusy(true);
    setFeedbackError(null);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, customerId: card.customerId, skip: true, session: sessionSnapshot }),
      });
      const payload = (await readJsonResponse(response)) as { error?: string; card?: WorkspaceCard };
      if (!response.ok) {
        setFeedbackError(payload.error || "Could not skip feedback.");
        feedbackLockRef.current = false;
        return;
      }
      if (payload.card) setCard(payload.card);
      setFeedbackRecorded("skipped");
      setFeedbackOpen(false);
      setFeedbackConfirmation(null);
    } catch {
      setFeedbackError("Could not skip feedback. Please try again.");
      feedbackLockRef.current = false;
    } finally {
      setFeedbackBusy(false);
    }
  }

  function formatClock(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function replay() {
    const audio = audioRef.current;
    if (!audio || !audioUrl) {
      setError("There is no generated reply to replay yet.");
      return;
    }
    void audio.play();
  }

  if (!signedIn || !card) {
    return (
      <div className="support-shell compact-login">
        <section className="panel">
          <div className="panel-head">
            <h2>Customer support</h2>
            <p>Enter a demo Customer ID and Order ID, or go back to choose a profile.</p>
          </div>
          <div className="login-grid">
            <label className="field">
              Customer ID
              <input value={customerId} onChange={(event) => setCustomerId(event.target.value.toUpperCase())} placeholder="CUST-1001" />
            </label>
            <label className="field">
              Order ID
              <input value={orderId} onChange={(event) => setOrderId(event.target.value.toUpperCase())} placeholder="VW-1001" />
            </label>
          </div>
          {error ? <div className="banner banner-amber">{error}</div> : null}
          <div className="actions">
            <button className="primary" disabled={busy} onClick={() => void signIn()}>
              Continue to support desk
            </button>
            {onSignOut ? (
              <button className="ghost" onClick={onSignOut}>
                Back to demo customers
              </button>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="support-workspace">
      <aside className="panel customer-rail">
        <div className="panel-head rail-top">
          <button className="ghost linkish-back" onClick={signOut}>
            ← Change demo customer
          </button>
          {savedAtLabel || card.lastSessionSavedAt ? (
            <p className="muted tiny">
              Updated after conversation {savedAtLabel || formatClock(card.lastSessionSavedAt!)}
            </p>
          ) : (
            <p className="muted tiny">Live customer card</p>
          )}
        </div>
        <div className="identity-block">
          <div className="avatar" aria-hidden="true">
            <img src={card.avatarUrl || customerAvatarSrc(card.customerId)} alt="" />
          </div>
          <div>
            <strong>{card.customerName}</strong>
            <p className="muted">
              {card.customerId} · {card.city} · Member since {card.memberSince}
            </p>
            <span className="pill pill-fail">Demo profile</span>
          </div>
        </div>

        <div className="issue-card">
          <strong>Current issue</strong>
          <p>{card.title}</p>
          <small>{card.customerProblem}</small>
        </div>

        <div className={`priority-banner priority-${card.priority.level.toLowerCase()}`}>
          <strong>
            {card.priority.level} {card.priority.label}
          </strong>
          <span>{card.priority.reasons[0] ?? card.priority.decisionHint}</span>
        </div>

        <div className="order-card">
          <h3>Current order & refund</h3>
          <div className="meta-grid">
            <div>
              <strong>Order</strong>
              {card.orderId}
            </div>
            <div>
              <strong>Product</strong>
              {card.product}
            </div>
            <div>
              <strong>Product ID</strong>
              <span className="mono">{card.productId}</span>
            </div>
            <div>
              <strong>Amount</strong>
              {card.amountLabel} · {card.paymentMethod}
            </div>
            <div>
              <strong>Refund status</strong>
              <span className="status-dot">{card.caseState.replaceAll("_", " ")}</span>
            </div>
          </div>
        </div>

        <div className="experience-card">
          <h3>Customer experience</h3>
          <p>
            <strong className="sentiment-label">
              {formatSentimentLabel(card.priority.sentiment || card.behavior)}
            </strong>
          </p>
          <small>{card.priority.issueFocus ? `Focus: ${card.priority.issueFocus.replaceAll("_", " ")}` : card.situation}</small>
          <div className="meta-grid">
            <div>
              <strong>Previous contacts</strong>
              {String(card.pastIssues.length).padStart(2, "0")}
            </div>
            <div>
              <strong>Preferred language</strong>
              {card.preferredLanguage === "hi" ? "Hindi" : card.preferredLanguage === "hinglish" ? "Hinglish" : "English"}
            </div>
          </div>
        </div>

        {conversationEnded ? (
          <div className="banner banner-teal saved-banner">
            <strong>Conversation saved</strong>
            <p>This conversation was saved{savedAtLabel ? ` at ${savedAtLabel}` : ""}.</p>
          </div>
        ) : null}

        <div className="decision-board">
          <p>
            <strong>Next action</strong>
            {(outcome ?? livePriority)?.nextStep}
          </p>
        </div>

        {ticketId || ticketType ? (
          <div className="ops-ticket" role="status">
            <strong>Support ticket</strong>
            <p className="mono">{ticketId || "Pending"}</p>
            <span className="pill pill-pass">Open</span>
            <small>
              {ticketType === "payment_support"
                ? "Payment support"
                : ticketType === "logistics"
                  ? "Pickup support"
                  : ticketType === "human_review"
                    ? "Human review"
                    : "Care desk"}
            </small>
          </div>
        ) : null}

        <details className="past-conversations">
          <summary>Past conversations ({(card.pastConversations ?? []).length})</summary>
          {(card.pastConversations ?? []).length === 0 ? (
            <p className="muted">No earlier conversations on file.</p>
          ) : (
            <ul className="history-list conversation-history">
              {(card.pastConversations ?? []).slice(0, 8).map((entry) => (
                <li key={entry.sessionId ?? `${entry.when}-${entry.orderId}-${entry.summary.slice(0, 24)}`}>
                  <div className="past-entry-head">
                    <strong>
                      {entry.when} · {entry.channel}
                    </strong>
                    {entry.priority ? <span className="pill">{entry.priority}</span> : null}
                  </div>
                  <div className="past-entry-meta">
                    <span>
                      <em>Product</em> {entry.productName ?? "—"}
                    </span>
                    <span>
                      <em>SKU</em> <span className="mono">{entry.productId ?? "—"}</span>
                    </span>
                    <span>
                      <em>Order</em> <span className="mono">{entry.orderId ?? "—"}</span>
                    </span>
                    <span>
                      <em>Issue</em> {entry.issue ?? "—"}
                    </span>
                    <span>
                      <em>Status</em> {entry.status ?? "—"}
                    </span>
                    <span>
                      <em>Resolution</em> {entry.resolution ?? entry.outcome}
                    </span>
                    {entry.nextAction || entry.ticketId ? (
                      <span>
                        <em>Next</em>{" "}
                        {entry.ticketId ? `Ticket ${entry.ticketId}` : ""}
                        {entry.ticketId && entry.nextAction ? " · " : ""}
                        {entry.nextAction ?? ""}
                      </span>
                    ) : null}
                  </div>
                  <p className="past-entry-summary">{entry.summary}</p>
                  <button type="button" className="ghost past-view-btn" onClick={() => setArchiveEntry(entry)}>
                    View full conversation
                  </button>
                </li>
              ))}
            </ul>
          )}
        </details>

        {feedbackRecorded !== "none" ? (
          <p className="muted tiny">
            Survey: {feedbackRecorded === "submitted" ? "Feedback submitted" : "No feedback"}
          </p>
        ) : conversationEnded ? (
          <p className="muted tiny">Survey: No feedback yet</p>
        ) : null}
      </aside>

      <section className="panel conversation-panel">
        <div className="panel-head">
          <div>
            <h2>Voice support</h2>
            <p>
              <span className={`ready-dot ${conversationEnded ? "ended" : "ready"}`} />
              {conversationEnded ? "Conversation ended" : status?.liveAvailable ? "Voice agent ready" : "Simulated reply mode"}
            </p>
          </div>
          <fieldset className="language compact">
            <legend>Language</legend>
            {(["auto", "en", "hi"] as const).map((mode) => (
              <label key={mode}>
                <input
                  type="radio"
                  name="language"
                  checked={languageMode === mode}
                  disabled={conversationEnded}
                  onChange={() => setLanguageMode(mode)}
                />
                {mode === "auto" ? "Auto" : mode === "en" ? "English" : "Hindi"}
              </label>
            ))}
          </fieldset>
        </div>
        {error ? <div className="banner banner-amber">{error}</div> : null}
        <div className="thread" aria-live="polite">
          {messages.length === 0 ? (
            <p className="muted">
              Tap the microphone to speak, or type your issue. Your selected profile already opens this customer’s order.
            </p>
          ) : null}
          {messages.map((message) => {
            const isAgent = message.role === "agent";
            const avatarSrc = isAgent ? AGENT_AVATAR_SRC : card.avatarUrl || customerAvatarSrc(card.customerId);
            return (
              <div key={message.id} className={isAgent ? "chat-row agent" : "chat-row customer"}>
                <img className="chat-avatar" src={avatarSrc} alt="" />
                <article className={isAgent ? "bubble agent" : "bubble customer"}>
                  <header>{isAgent ? "VelaWear voice agent" : card.customerName.split(" ")[0] || "You"}</header>
                  <p>{message.text}</p>
                  {message.simulated ? <span className="pill">Simulated</span> : null}
                </article>
              </div>
            );
          })}
        </div>
        {pending && !conversationEnded ? (
          <div className="banner banner-teal">
            <p>Support action waiting: {pending.replaceAll("_", " ")}. Confirm only if you want the ticket raised.</p>
            <div className="actions">
              <button className="primary" disabled={busy} onClick={() => void decide(true)}>
                Approve request
              </button>
              <button className="ghost" disabled={busy} onClick={() => void decide(false)}>
                Not now
              </button>
            </div>
          </div>
        ) : null}
        <label className="field" htmlFor="transcript">
          {conversationEnded ? "Conversation ended" : "Type a message…"}
          <textarea
            id="transcript"
            ref={draftRef}
            value={conversationEnded ? "" : draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={
              conversationEnded
                ? "Conversation ended. Feedback is optional."
                : phase === "recording"
                  ? "Recording in progress — tap Send to stop and send, or Cancel."
                  : "Type a message, or tap the microphone to speak…"
            }
            disabled={conversationEnded || phase === "recording" || phase === "transcribing"}
          />
        </label>
        {phase === "recording" || phase === "transcribing" ? (
          <div
            className={phase === "recording" ? "recording-banner recording-banner-inline" : "banner banner-teal recording-banner-inline"}
            role="status"
            aria-live="assertive"
          >
            {phase === "recording" ? (
              <>
                <span className="recording-dot" aria-hidden="true" />
                <div>
                  <strong>Recording… {seconds}s / 60s</strong>
                  <p>Tap Send to stop and send · Cancel to discard. Pausing is fine.</p>
                </div>
              </>
            ) : (
              <p>Turning your recording into text and sending…</p>
            )}
          </div>
        ) : null}
        <div className="actions controls">
          {phase === "recording" ? (
            <>
              <button className="primary stop-hot" type="button" onClick={finishVoiceAndSend}>
                Send
              </button>
              <button className="ghost" type="button" onClick={cancelRecording}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                className="primary mic-button"
                type="button"
                disabled={conversationEnded || phase === "transcribing" || busy}
                onClick={() => void startRecording()}
                aria-label="Microphone"
              >
                Microphone
              </button>
              <button
                className="primary"
                type="button"
                disabled={conversationEnded || !draft.trim() || busy || phase === "transcribing"}
                onClick={() => void sendDraft()}
              >
                Send
              </button>
            </>
          )}
          <button className="ghost" type="button" disabled={conversationEnded || !audioUrl || phase === "recording"} onClick={replay}>
            Replay last message
          </button>
          <button
            className="end-conversation"
            type="button"
            disabled={!sessionId || busy || conversationEnded || phase === "recording"}
            onClick={() => void endConversation()}
          >
            End conversation
          </button>
        </div>
        <p className="muted disclaimer">
          This conversation is recorded and transcribed to help us assist you better. Demo profiles use sample order data only.
        </p>
        <audio ref={audioRef} />
        {conversationEnded && sessionId ? (
          <div className="actions">
            <button className="ghost" type="button" onClick={() => onOpenDashboard(sessionId)}>
              Open performance evaluation
            </button>
            {feedbackRecorded === "none" ? (
              <button className="secondary" type="button" onClick={() => setFeedbackOpen(true)}>
                Give feedback
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <FeedbackModal
        open={feedbackOpen}
        busy={feedbackBusy}
        error={feedbackError}
        confirmation={feedbackConfirmation}
        onSubmit={(input) => void submitFeedback(input)}
        onSkip={() => void skipFeedback()}
        onClose={() => {
          setFeedbackOpen(false);
          setFeedbackConfirmation(null);
        }}
      />

      {archiveEntry ? (
        <div className="feedback-overlay" role="dialog" aria-modal="true" aria-labelledby="archive-title">
          <div className="archive-modal">
            <div className="archive-modal-head">
              <div>
                <p className="muted tiny">Read-only archive</p>
                <h2 id="archive-title">
                  {archiveEntry.when} · {archiveEntry.channel}
                </h2>
              </div>
              <button type="button" className="ghost" onClick={() => setArchiveEntry(null)}>
                Close
              </button>
            </div>
            <div className="past-entry-meta archive-meta">
              <span>
                <em>Customer</em> {card.customerName} ({archiveEntry.customerId})
              </span>
              <span>
                <em>Product</em> {archiveEntry.productName ?? "—"}
              </span>
              <span>
                <em>SKU</em> <span className="mono">{archiveEntry.productId ?? "—"}</span>
              </span>
              <span>
                <em>Order</em> <span className="mono">{archiveEntry.orderId ?? "—"}</span>
              </span>
              <span>
                <em>Issue</em> {archiveEntry.issue ?? "—"}
              </span>
              <span>
                <em>Priority</em> {archiveEntry.priority ?? "—"}
              </span>
              <span>
                <em>Status</em> {archiveEntry.status ?? "—"}
              </span>
              <span>
                <em>Resolution</em> {archiveEntry.resolution ?? archiveEntry.outcome}
              </span>
              <span>
                <em>Next action</em> {archiveEntry.nextAction ?? "—"}
              </span>
              <span>
                <em>Ticket</em> {archiveEntry.ticketId ?? "None"}
              </span>
            </div>
            <div className="archive-section">
              <strong>Actions taken</strong>
              <ul>
                {(archiveEntry.actions?.length ? archiveEntry.actions : ["No actions recorded"]).map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </div>
            <div className="archive-section">
              <strong>Outcome</strong>
              <p>{archiveEntry.outcome}</p>
            </div>
            {archiveEntry.feedback && archiveEntry.feedback.status !== "none" ? (
              <div className="archive-section">
                <strong>Feedback</strong>
                <p>
                  {archiveEntry.feedback.status === "skipped"
                    ? "Skipped"
                    : `Satisfied: ${archiveEntry.feedback.satisfied ?? "—"} · Resolved: ${archiveEntry.feedback.resolved ?? "—"}`}
                </p>
                {archiveEntry.feedback.comment ? <small>{archiveEntry.feedback.comment}</small> : null}
              </div>
            ) : (
              <div className="archive-section">
                <strong>Feedback</strong>
                <p>No feedback</p>
              </div>
            )}
            <div className="archive-section">
              <strong>Full transcript</strong>
              <div className="archive-thread">
                {(archiveEntry.transcript ?? []).map((turn, index) => {
                  const isAgent = turn.role === "agent";
                  const avatarSrc = isAgent
                    ? AGENT_AVATAR_SRC
                    : customerAvatarSrc(archiveEntry.customerId || card.customerId);
                  return (
                    <div key={`${turn.at}-${index}`} className={isAgent ? "chat-row agent" : "chat-row customer"}>
                      <img className="chat-avatar" src={avatarSrc} alt="" />
                      <article className={isAgent ? "bubble agent" : "bubble customer"}>
                        <header>{isAgent ? "VelaWear voice agent" : card.customerName.split(" ")[0] || "Customer"}</header>
                        <p>{turn.text}</p>
                      </article>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="muted tiny">Archived conversations cannot be edited.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
