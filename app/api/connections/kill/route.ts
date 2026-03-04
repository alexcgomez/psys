import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const pid = typeof body?.pid === "number" ? body.pid : parseInt(String(body?.pid), 10);
    if (!Number.isInteger(pid) || pid <= 0) {
      return NextResponse.json({ error: "Invalid pid" }, { status: 400 });
    }
    process.kill(pid, "SIGTERM");
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code === "ESRCH") {
      return NextResponse.json({ error: "Process not found" }, { status: 404 });
    }
    if (err?.code === "EPERM") {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }
    console.error(e);
    return NextResponse.json(
      { error: err?.message ?? "Failed to kill process" },
      { status: 500 }
    );
  }
}
