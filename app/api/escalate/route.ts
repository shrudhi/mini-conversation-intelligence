import { NextResponse } from "next/server";
import { applyCustomerTurn } from "@/lib/agent";
import { getSession, saveSession } from "@/lib/sessions";
import { TicketError, createApprovedTicket, listTickets } from "@/lib/tickets";
import type { PersistedSession } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tickets = await listTickets();
    return NextResponse.json({ tickets });
  } catch (error) {
    const message = error instanceof TicketError ? error.message : "Saved tickets could not be read.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Not created. The request body must be JSON." }, { status: 400 });
  }
  if (typeof body.sessionId !== "string") {
    return NextResponse.json({ error: "Not created. A conversation is required." }, { status: 400 });
  }
  const session = await getSession(body.sessionId);
  if (!session) return NextResponse.json({ error: "Not created. That conversation was not found." }, { status: 404 });
  if (!session.pendingAction) {
    return NextResponse.json({ error: "Not created. There is no escalation waiting for approval." }, { status: 400 });
  }

  const approved = body.approved === true;
  const next = await applyCustomerTurn(
    session,
    approved ? "Yes, please create the ticket." : "Not now",
    {
      createTicket: async ({ orderId, type }) => {
        if (session.toolFailure) return { error: "Lookup failed, so no ticket was created." };
        try {
          const result = await createApprovedTicket({ orderId, type, approved: true });
          return { ticketId: result.ticket.ticket_id, created: result.created };
        } catch (error) {
          return { error: error instanceof TicketError ? error.message : "Not created. The mock ticket could not be saved." };
        }
      },
    },
  );
  const saved: PersistedSession = {
    ...next,
    id: session.id,
    createdAt: session.createdAt,
    updatedAt: new Date().toISOString(),
    ended: session.ended,
    source: next.turns.some((turn) => turn.responseSource === "model") ? "live" : session.source,
  };
  await saveSession(saved);
  const turn = saved.turns[saved.turns.length - 1];
  return NextResponse.json({
    sessionId: saved.id,
    reply: turn?.responseText ?? "",
    simulated: saved.source !== "live",
    pendingApproval: saved.pendingAction,
    ticket: turn?.ticket ?? null,
    created: turn?.ticket?.created ?? false,
    ticketId: saved.ticketId,
    ticketType: saved.ticketType,
    liveSentiment: saved.liveSentiment,
    liveIssueFocus: saved.liveIssueFocus,
  });
}
