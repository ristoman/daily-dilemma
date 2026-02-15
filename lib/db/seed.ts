import { config } from "dotenv";
config({ path: ".env.local" });

import { sql } from "@vercel/postgres";
import { drizzle } from "drizzle-orm/vercel-postgres";
import { dilemmas } from "./schema";

async function seed() {
  const db = drizzle(sql);

  const allDilemmas = [
    { question: "Is a hot dog a sandwich?", optionA: "Yes", optionB: "No", publishedDate: "2026-02-15" },
    { question: "Is cereal a soup?", optionA: "Yes", optionB: "No", publishedDate: "2026-02-16" },
    { question: "Does pineapple belong on pizza?", optionA: "Absolutely", optionB: "Never", publishedDate: "2026-02-17" },
    { question: "Is water wet?", optionA: "Yes", optionB: "No", publishedDate: "2026-02-18" },
    { question: "Would you rather fight 100 duck-sized horses or 1 horse-sized duck?", optionA: "Tiny horses", optionB: "Giant duck", publishedDate: "2026-02-19" },
    { question: "Is a taco a sandwich?", optionA: "Yes", optionB: "No", publishedDate: "2026-02-20" },
    { question: "Should toilet paper hang over or under?", optionA: "Over", optionB: "Under", publishedDate: "2026-02-21" },
    { question: "Is it acceptable to recline your seat on a plane?", optionA: "Yes", optionB: "No", publishedDate: "2026-02-22" },
    { question: "GIF: hard G or soft G?", optionA: "Hard G", optionB: "Soft G", publishedDate: "2026-02-23" },
    { question: "Would you rather know how you die or when you die?", optionA: "How", optionB: "When", publishedDate: "2026-02-24" },
  ];

  await db.insert(dilemmas).values(allDilemmas).onConflictDoNothing();

  console.log(`Seeded ${allDilemmas.length} dilemmas`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
