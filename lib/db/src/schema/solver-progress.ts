import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { cluesTable } from "./clues";

export const solverProgressTable = pgTable(
  "solver_progress",
  {
    id: serial("id").primaryKey(),
    clueId: integer("clue_id")
      .notNull()
      .references(() => cluesTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    displayName: text("display_name").notNull(),
    attemptsUsed: integer("attempts_used").notNull().default(0),
    hintsRevealed: integer("hints_revealed").notNull().default(0),
    assistEnabled: boolean("assist_enabled").notNull().default(false),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    solvedAt: timestamp("solved_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    elapsedSeconds: integer("elapsed_seconds"),
  },
  (table) => [uniqueIndex("solver_progress_clue_user_idx").on(table.clueId, table.userId)],
);

export const insertSolverProgressSchema = createInsertSchema(solverProgressTable).omit({
  id: true,
  startedAt: true,
});
export type InsertSolverProgress = z.infer<typeof insertSolverProgressSchema>;
export type SolverProgress = typeof solverProgressTable.$inferSelect;
