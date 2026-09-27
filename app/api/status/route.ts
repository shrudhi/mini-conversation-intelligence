import { NextResponse } from "next/server";
import { POLICY_VERSION, RUBRIC_VERSION } from "@/lib/constants";
import { listCustomers, listWorkspaceCards, loginWorkspace } from "@/lib/customers";
import { agentModel, hasApiKey, transcriptionModel, ttsModel, ttsVoice } from "@/lib/env";
import { limitSnapshot } from "@/lib/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const limits = limitSnapshot();
  const cards = await listWorkspaceCards();
  return NextResponse.json({
    liveAvailable: hasApiKey(),
    agentModel: agentModel(),
    transcriptionModel: transcriptionModel(),
    ttsModel: ttsModel(),
    ttsVoice: ttsVoice(),
    policyVersion: POLICY_VERSION,
    rubricVersion: RUBRIC_VERSION,
    ...limits,
    customers: listCustomers().map((customer) => ({
      customerId: customer.customerId,
      name: customer.name,
      city: customer.city,
      segment: customer.segment,
      orderIds: customer.orderIds,
      preferredLanguage: customer.preferredLanguage,
    })),
    cards,
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Send customer ID and order ID as JSON." }, { status: 400 });
  }
  if (typeof body.customerId !== "string" || typeof body.orderId !== "string") {
    return NextResponse.json({ error: "Customer ID and order ID are required." }, { status: 400 });
  }
  const result = await loginWorkspace(body.customerId, body.orderId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ card: result.card });
}
