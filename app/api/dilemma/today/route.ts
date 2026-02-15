import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq, sql, notInArray, count } from "drizzle-orm";
import { db } from "@/lib/db";
import { dilemmas, votes } from "@/lib/db/schema";

export async function GET() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("daily-dilemma-session")?.value;

  // Find dilemmas this session has already answered
  let answeredIds: number[] = [];
  if (sessionId) {
    const answered = await db
      .select({ dilemmaId: votes.dilemmaId })
      .from(votes)
      .where(eq(votes.sessionId, sessionId));
    answeredIds = answered.map((r) => r.dilemmaId);
  }

  // Get a random unanswered dilemma
  const unanswered = await db
    .select()
    .from(dilemmas)
    .where(
      answeredIds.length > 0
        ? notInArray(dilemmas.id, answeredIds)
        : undefined
    )
    .orderBy(sql`random()`)
    .limit(1)
    .then((rows) => rows[0]);

  // Get total dilemma count
  const [{ total }] = await db
    .select({ total: count() })
    .from(dilemmas);

  const answeredCount = answeredIds.length;

  if (!unanswered) {
    return NextResponse.json({ dilemma: null, answeredCount, totalCount: total });
  }

  // Get vote counts for this dilemma
  const voteCounts = await db
    .select({
      choice: votes.choice,
      count: sql<number>`count(*)::int`,
    })
    .from(votes)
    .where(eq(votes.dilemmaId, unanswered.id))
    .groupBy(votes.choice);

  const a = voteCounts.find((v) => v.choice === "a")?.count ?? 0;
  const b = voteCounts.find((v) => v.choice === "b")?.count ?? 0;

  return NextResponse.json({
    dilemma: {
      id: unanswered.id,
      question: unanswered.question,
      optionA: unanswered.optionA,
      optionB: unanswered.optionB,
      votes: { a, b },
      userVote: null,
    },
    answeredCount,
    totalCount: total,
  });
}
