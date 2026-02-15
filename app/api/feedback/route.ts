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

  // Mirror to Notion (fire-and-forget, don't fail the request if this errors)
  const notionToken = process.env.NOTION_API_KEY;
  const notionPageId = process.env.NOTION_FEEDBACK_PAGE_ID;
  if (notionToken && notionPageId) {
    const timestamp = new Date().toISOString();
    fetch(`https://api.notion.com/v1/blocks/${notionPageId}/children`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${notionToken}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        children: [
          {
            object: "block",
            type: "quote",
            quote: {
              rich_text: [{ type: "text", text: { content: message.trim() } }],
            },
          },
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [
                {
                  type: "text",
                  text: { content: timestamp },
                  annotations: { color: "gray" },
                },
              ],
            },
          },
          { object: "block", type: "divider", divider: {} },
        ],
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
