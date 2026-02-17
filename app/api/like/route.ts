import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq, sql, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { likes } from "@/lib/db/schema";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { dilemma_id } = body;

  if (!dilemma_id) {
    return NextResponse.json(
      { error: "Invalid dilemma_id" },
      { status: 400 }
    );
  }

  const cookieStore = await cookies();
  const sessionId = cookieStore.get("daily-dilemma-session")?.value;

  if (!sessionId) {
    return NextResponse.json(
      { error: "No session — vote on a dilemma first" },
      { status: 401 }
    );
  }

  // Check for duplicate like
  const existing = await db
    .select({ id: likes.id })
    .from(likes)
    .where(
      and(
        eq(likes.dilemmaId, dilemma_id),
        eq(likes.sessionId, sessionId)
      )
    )
    .limit(1)
    .then((rows) => rows[0]);

  if (existing) {
    return NextResponse.json(
      { error: "Already liked this dilemma" },
      { status: 409 }
    );
  }

  await db.insert(likes).values({
    dilemmaId: dilemma_id,
    sessionId,
  });

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(likes)
    .where(eq(likes.dilemmaId, dilemma_id));

  return NextResponse.json({ likes: count, userLiked: true });
}
