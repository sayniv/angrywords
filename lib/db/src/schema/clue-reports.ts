import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { cluesTable } from "./clues";

export const clueReportsTable = pgTable(
  "clue_reports",
  {
    id: serial("id").primaryKey(),
    clueId: integer("clue_id")
      .notNull()
      .references(() => cluesTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("clue_reports_clue_user_idx").on(table.clueId, table.userId)],
);

export const insertClueReportSchema = createInsertSchema(clueReportsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertClueReport = z.infer<typeof insertClueReportSchema>;
export type ClueReport = typeof clueReportsTable.$inferSelect;
