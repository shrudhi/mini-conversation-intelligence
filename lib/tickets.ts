import { escalationDestination, idempotencyKey, type EscalationType } from "./constants";
import { getCaseByOrderId } from "./cases";
import { readJson, withStoreLock, writeJson } from "./persist";
import { decideCase } from "./rules";
import type { MockTicket } from "./types";

const FILE = "tickets.json";

export class TicketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TicketError";
  }
}

export function listTickets(): Promise<MockTicket[]> {
  return withStoreLock(() => readJson<MockTicket[]>(FILE, []));
}

export function createApprovedTicket(input: {
  orderId: string;
  type: EscalationType;
  approved: boolean;
}): Promise<{ ticket: MockTicket; created: boolean }> {
  if (!input.approved) {
    return Promise.reject(new TicketError("Not created. Support escalation requires explicit approval."));
  }
  const record = getCaseByOrderId(input.orderId);
  if (!record) {
    return Promise.reject(new TicketError("Not created. The order was not found."));
  }
  const decision = decideCase(record);
  if (!decision.eligible || decision.escalationType !== input.type) {
    return Promise.reject(new TicketError(`Not created. ${decision.reason}`));
  }
  const key = idempotencyKey(record.orderId, input.type);
  return withStoreLock(async () => {
    const tickets = await readJson<MockTicket[]>(FILE, []);
    const existing = tickets.find((ticket) => ticket.idempotency_key === key);
    if (existing) return { ticket: existing, created: false };
    const ticket: MockTicket = {
      ticket_id: `CARE-TICKET-${String(tickets.length + 1).padStart(3, "0")}`,
      order_id: record.orderId,
      case_alias: record.alias,
      type: input.type,
      destination: escalationDestination(input.type),
      status: "open",
      idempotency_key: key,
      created_at: new Date().toISOString(),
    };
    await writeJson(FILE, [...tickets, ticket]);
    return { ticket, created: true };
  });
}
