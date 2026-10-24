import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq, sql, notInArray, count, lte, and, desc, asc, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { dilemmas, votes, likes } from "@/lib/db/schema";

type Mode = "newest" | "popular" | "divisive";

// Divisive needs enough votes for the split to mean anything
const MIN_VOTES_FOR_DIVISIVE = 10;

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.get("mode");
  let mode: Mode =
    requested === "popular" || requested === "divisive" ? requested : "newest";

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

  // Use Europe/Berlin date so dilemmas unlock at midnight CET/CEST
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });

  // Per-dilemma vote totals, used to rank by popularity / divisiveness
  const stats = db
    .select({
      dilemmaId: votes.dilemmaId,
      total: sql<number>`count(*)::int`.as("total"),
      aCount: sql<number>`(count(*) filter (where ${votes.choice} = 'a'))::int`.as("a_count"),
    })
    .from(votes)
    .groupBy(votes.dilemmaId)
    .as("vote_stats");

  const totalVotes = sql<number>`coalesce(${stats.total}, 0)`;
  // Distance of the A/B split from 50/50 (0 = perfectly divisive)
  const skew = sql`abs(${stats.aCount}::float / nullif(${stats.total}, 0) - 0.5)`;

  // Get the two best unanswered dilemmas for the mode (first = current, second = teaser)
  const fetchUnanswered = (m: Mode) =>
    db
      .select({ dilemma: dilemmas })
      .from(dilemmas)
      .leftJoin(stats, eq(stats.dilemmaId, dilemmas.id))
      .where(
        and(
          lte(dilemmas.publishedDate, today),
          answeredIds.length > 0 ? notInArray(dilemmas.id, answeredIds) : undefined,
          m === "divisive" ? gte(totalVotes, MIN_VOTES_FOR_DIVISIVE) : undefined
        )
      )
      .orderBy(
        ...(m === "popular"
          ? [desc(totalVotes), desc(dilemmas.publishedDate)]
          : m === "divisive"
            ? [asc(skew), desc(totalVotes)]
            : [desc(dilemmas.publishedDate)])
      )
      .limit(2);

  let unansweredRows = (await fetchUnanswered(mode)).map((r) => r.dilemma);
  if (unansweredRows.length === 0 && mode === "divisive") {
    // Not enough votes anywhere yet: fall back to newest
    mode = "newest";
    unansweredRows = (await fetchUnanswered(mode)).map((r) => r.dilemma);
  }

  const unanswered = unansweredRows[0];
  const nextQuestion = unansweredRows[1]?.question ?? null;

  // Get total published dilemma count
  const [{ total }] = await db
    .select({ total: count() })
    .from(dilemmas)
    .where(lte(dilemmas.publishedDate, today));

  const answeredCount = answeredIds.length;

  if (!unanswered) {
    return NextResponse.json({ dilemma: null, answeredCount, totalCount: total, mode });
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

  // Get like count and whether this session liked it
  const [{ likeCount }] = await db
    .select({ likeCount: sql<number>`count(*)::int` })
    .from(likes)
    .where(eq(likes.dilemmaId, unanswered.id));

  const userLiked = sessionId
    ? await db
        .select({ id: likes.id })
        .from(likes)
        .where(and(eq(likes.dilemmaId, unanswered.id), eq(likes.sessionId, sessionId)))
        .limit(1)
        .then((rows) => rows.length > 0)
    : false;

  return NextResponse.json({
    dilemma: {
      id: unanswered.id,
      question: unanswered.question,
      optionA: unanswered.optionA,
      optionB: unanswered.optionB,
      publishedDate: unanswered.publishedDate,
      votes: { a, b },
      userVote: null,
      likes: likeCount,
      userLiked,
    },
    answeredCount,
    totalCount: total,
    nextQuestion,
    mode,
  });
}
