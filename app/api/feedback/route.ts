import { NextResponse } from "next/server";
import { buildWorkspaceCard, getCustomerByOrderId } from "@/lib/customers";
import {
  appendConversationHistory,
  buildHistoryEntry,
  getFeedbackBySession,
  saveFeedback,
} from "@/lib/feedback";
import { resolveSession } from "@/lib/sessions";
import type { FeedbackResolution, FeedbackSatisfaction, FeedbackStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
  }
  const feedback = await getFeedbackBySession(sessionId);
  return NextResponse.json({ feedback });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Feedback request must be JSON." }, { status: 400 });
  }

  if (typeof body.sessionId !== "string") {
    return NextResponse.json({ error: "A conversation is required." }, { status: 400 });
  }

  const session = await resolveSession(body.sessionId, body.session);
  if (!session) return NextResponse.json({ error: "That conversation was not found." }, { status: 404 });
  if (!session.ended) {
    return NextResponse.json({ error: "End the conversation before sending feedback." }, { status: 400 });
  }

  const status: FeedbackStatus = body.skip === true || body.status === "skipped" ? "skipped" : "submitted";
  const orderId = session.verifiedOrderId ?? session.selectedOrderId;
  const customerId =
    (typeof body.customerId === "string" ? body.customerId : null) ??
    session.customerId ??
    (orderId ? getCustomerByOrderId(orderId)?.customerId ?? null : null);

  const result = await saveFeedback({
    sessionId: session.id,
    customerId,
    orderId,
    status,
    satisfied: isSatisfaction(body.satisfied) ? body.satisfied : null,
    resolved: isResolution(body.resolved) ? body.resolved : null,
    comment: typeof body.comment === "string" ? body.comment : null,
  });

  if (!result.ok) {
    const statusCode = result.code === "duplicate" ? 409 : result.code === "invalid" ? 400 : 503;
    return NextResponse.json({ error: result.error, code: result.code }, { status: statusCode });
  }

  if (customerId) {
    await appendConversationHistory(buildHistoryEntry(session, customerId, result.feedback));
  }

  const card = orderId ? await buildWorkspaceCard(orderId) : null;
  return NextResponse.json({ feedback: result.feedback, card });
}

function isSatisfaction(value: unknown): value is FeedbackSatisfaction {
  return value === "yes" || value === "no";
}

function isResolution(value: unknown): value is FeedbackResolution {
  return value === "yes" || value === "partly" || value === "no";
}
