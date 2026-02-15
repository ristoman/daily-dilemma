import {
  pgTable,
  serial,
  text,
  date,
  timestamp,
  integer,
} from "drizzle-orm/pg-core";

export const dilemmas = pgTable("dilemmas", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  optionA: text("option_a").notNull(),
  optionB: text("option_b").notNull(),
  publishedDate: date("published_date").notNull().unique(),
});

export const votes = pgTable("votes", {
  id: serial("id").primaryKey(),
  dilemmaId: integer("dilemma_id")
    .notNull()
    .references(() => dilemmas.id),
  choice: text("choice").notNull(), // 'a' or 'b'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  sessionId: text("session_id").notNull(),
});

export const feedback = pgTable("feedback", {
  id: serial("id").primaryKey(),
  message: text("message").notNull(),
  sessionId: text("session_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
