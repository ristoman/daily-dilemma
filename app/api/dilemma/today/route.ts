import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq, sql, notInArray, count, lte, and, desc } from "drizzle-orm";
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

  const today = new Date().toISOString().split("T")[0];

  // Get the most recent unanswered dilemma that has been published
  const unanswered = await db
    .select()
    .from(dilemmas)
    .where(
      and(
        lte(dilemmas.publishedDate, today),
        answeredIds.length > 0 ? notInArray(dilemmas.id, answeredIds) : undefined
      )
    )
    .orderBy(desc(dilemmas.publishedDate))
    .limit(1)
    .then((rows) => rows[0]);

  // Get total published dilemma count
  const [{ total }] = await db
    .select({ total: count() })
    .from(dilemmas)
    .where(lte(dilemmas.publishedDate, today));

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
      publishedDate: unanswered.publishedDate,
      votes: { a, b },
      userVote: null,
    },
    answeredCount,
    totalCount: total,
  });
}
