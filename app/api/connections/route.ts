import { NextResponse } from "next/server";
import { getConnectionsData } from "@/lib/connections";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const data = getConnectionsData();
    return NextResponse.json(data);
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to get connections" },
      { status: 500 }
    );
  }
}
