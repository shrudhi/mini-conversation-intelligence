import { NextResponse } from "next/server";
import { getAgentSettings, getAgentSettingsCapabilities, saveAgentSettings } from "@/lib/agent-settings-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [settings, capabilities] = await Promise.all([getAgentSettings(), Promise.resolve(getAgentSettingsCapabilities())]);
  return NextResponse.json({ settings, capabilities });
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Settings must be JSON." }, { status: 400 });
  }
  const settings = await saveAgentSettings(body);
  return NextResponse.json({ settings, capabilities: getAgentSettingsCapabilities() });
}
