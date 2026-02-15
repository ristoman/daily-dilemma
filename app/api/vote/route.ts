import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq, sql, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { votes } from "@/lib/db/schema";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { dilemma_id, choice } = body;

  if (!dilemma_id || !["a", "b"].includes(choice)) {
    return NextResponse.json(
      { error: "Invalid dilemma_id or choice" },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  let sessionId = cookieStore.get("daily-dilemma-session")?.value;

  if (!sessionId) {
    sessionId = crypto.randomUUID();
    cookieStore.set("daily-dilemma-session", sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
  }

  // Check for duplicate vote
  const existing = await db
    .select({ id: votes.id })
    .from(votes)
    .where(
      and(
        eq(votes.dilemmaId, dilemma_id),
        eq(votes.sessionId, sessionId)
      )
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (existing) {
    return NextResponse.json(
      { error: "Already voted on this dilemma" },
      { status: 409 }
    );
  }

  await db.insert(votes).values({
    dilemmaId: dilemma_id,
    choice,
    sessionId,
  });

  // Return updated counts
  const voteCounts = await db
    .select({
      choice: votes.choice,
      count: sql<number>`count(*)::int`,
    })
    .from(votes)
    .where(eq(votes.dilemmaId, dilemma_id))
    .groupBy(votes.choice);

  const a = voteCounts.find((v) => v.choice === "a")?.count ?? 0;
  const b = voteCounts.find((v) => v.choice === "b")?.count ?? 0;

  return NextResponse.json({ votes: { a, b } });
}
