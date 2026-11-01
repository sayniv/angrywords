import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const cluesTable = pgTable("clues", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 16 }).notNull().unique(),
  clue: text("clue").notNull(),
  answer: text("answer").notNull(),
  normalizedAnswer: text("normalized_answer").notNull(),
  wordplay: text("wordplay"),
  maxAttempts: integer("max_attempts").notNull(),
  setterUserId: text("setter_user_id").notNull(),
  setterName: varchar("setter_name", { length: 48 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  retiredAt: timestamp("retired_at", { withTimezone: true }),
});

export const insertClueSchema = createInsertSchema(cluesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertClue = z.infer<typeof insertClueSchema>;
export type Clue = typeof cluesTable.$inferSelect;
