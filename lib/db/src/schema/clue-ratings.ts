import { createInsertSchema } from "drizzle-zod";
import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { cluesTable } from "./clues";

export const clueRatingsTable = pgTable(
  "clue_ratings",
  {
    id: serial("id").primaryKey(),
    clueId: integer("clue_id")
      .notNull()
      .references(() => cluesTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    rating: integer("rating").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("clue_ratings_clue_user_idx").on(table.clueId, table.userId),
    index("clue_ratings_clue_rating_idx").on(table.clueId, table.rating),
  ],
);

export const insertClueRatingSchema = createInsertSchema(clueRatingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertClueRating = z.infer<typeof insertClueRatingSchema>;
export type ClueRating = typeof clueRatingsTable.$inferSelect;
