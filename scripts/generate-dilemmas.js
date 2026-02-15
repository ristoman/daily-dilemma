import { config } from "dotenv";
config({ path: ".env.local" });

import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { desc } from "drizzle-orm";
import { dilemmas } from "../lib/db/schema.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function generateDilemmas() {
  const db = drizzle(sql);

  // Fetch existing questions to avoid duplicates
  const existing = await db.select({ question: dilemmas.question }).from(dilemmas);
  const existingQuestions = existing.map((r) => r.question);

  const avoidList = existingQuestions.length > 0
    ? `\n\nDo NOT generate any of these existing questions (or close variations):\n${existingQuestions.map((q) => `- ${q}`).join("\n")}`
    : "";

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Generate 7 fun, polarizing (but non-political and non-controversial) dilemma questions. Each should have exactly two sides that people will genuinely disagree on. Think food debates, everyday preferences, hypothetical scenarios — things that are shareable and spark friendly arguments.

Return ONLY a JSON array with no other text. Each object should have:
- "question": the dilemma question
- "optionA": first answer (1-2 words MAX)
- "optionB": second answer (1-2 words MAX)

Example format:
[{"question": "Is a hot dog a sandwich?", "optionA": "Yes", "optionB": "No"}]${avoidList}`,
      },
    ],
  });

  const raw = response.content[0].text;
  const text = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  const generated = JSON.parse(text);

  if (!Array.isArray(generated) || generated.length !== 7) {
    throw new Error(`Expected 7 dilemmas, got ${generated?.length}`);
  }

  // Start from the day after the latest existing dilemma, or tomorrow
  const latest = await db
    .select({ date: dilemmas.publishedDate })
    .from(dilemmas)
    .orderBy(desc(dilemmas.publishedDate))
    .limit(1)
    .then((rows) => rows[0]);

  const startDate = latest
    ? new Date(latest.date + "T00:00:00")
    : new Date();

  const values = generated.map((d, i) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i + 1);
    return {
      question: d.question,
      optionA: d.optionA,
      optionB: d.optionB,
      publishedDate: date.toISOString().split("T")[0],
    };
  });

  await db.insert(dilemmas).values(values).onConflictDoNothing();

  console.log("Generated and inserted 7 dilemmas:");
  values.forEach((v) => {
    console.log(`  ${v.publishedDate}: ${v.question} (${v.optionA} / ${v.optionB})`);
  });

  process.exit(0);
}

generateDilemmas().catch((err) => {
  console.error("Failed to generate dilemmas:", err);
  process.exit(1);
});
