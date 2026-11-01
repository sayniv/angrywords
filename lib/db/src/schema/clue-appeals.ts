import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { cluesTable } from "./clues";

export const clueAppealsTable = pgTable("clue_appeals", {
  id: serial("id").primaryKey(),
  clueId: integer("clue_id")
    .notNull()
    .references(() => cluesTable.id),
  setterUserId: text("setter_user_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  reviewerUserId: text("reviewer_user_id"),
  reviewerAction: text("reviewer_action"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
});

export const insertClueAppealSchema = createInsertSchema(clueAppealsTable).omit({
  id: true,
  submittedAt: true,
  reviewerUserId: true,
  reviewerAction: true,
  reviewedAt: true,
});
export type InsertClueAppeal = z.infer<typeof insertClueAppealSchema>;
export type ClueAppeal = typeof clueAppealsTable.$inferSelect;
