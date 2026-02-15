import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { feedback } from "@/lib/db/schema";

export async function POST(req: Request) {
  const { message } = await req.json();

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  if (message.length > 2000) {
    return NextResponse.json({ error: "Message too long" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const sessionId = cookieStore.get("daily-dilemma-session")?.value || null;

  await db.insert(feedback).values({
    message: message.trim(),
    sessionId,
  });

  return NextResponse.json({ ok: true });
}
