import { and, eq, isNull } from "drizzle-orm";
import { cluesTable, solverProgressTable } from "@workspace/db/schema";
import { getSolveElapsedSeconds } from "./clue-hints";

export function getSolverProgressScope(clueId: number, userId: string) {
  return and(
    eq(solverProgressTable.clueId, clueId),
    eq(solverProgressTable.userId, userId),
  );
}

export function getDashboardActivityScope(userId: string) {
  return and(
    eq(solverProgressTable.userId, userId),
    isNull(cluesTable.retiredAt),
  );
}

export function getSolverActivityState(progress: {
  solvedAt: Date | null;
  failedAt: Date | null;
}) {
  return progress.solvedAt
    ? ("solved" as const)
    : progress.failedAt
      ? ("failed" as const)
      : ("in-progress" as const);
}

export function serializeSolverActivity(
  clue: Pick<
    typeof cluesTable.$inferSelect,
    "id" | "slug" | "clue" | "answer" | "maxAttempts" | "setterName"
  >,
  progress: Pick<
    typeof solverProgressTable.$inferSelect,
    "attemptsUsed" | "solvedAt" | "failedAt" | "elapsedSeconds" | "startedAt" | "hintsRevealed"
  >,
) {
  return {
    id: clue.id,
    slug: clue.slug,
    clue: clue.clue,
    answerLength: clue.answer.toLocaleUpperCase("en").replace(/[^A-Z0-9]/g, "").length,
    maxAttempts: clue.maxAttempts,
    setterName: clue.setterName,
    attemptsUsed: progress.attemptsUsed,
    attemptsRemaining: Math.max(0, clue.maxAttempts - progress.attemptsUsed),
    state: getSolverActivityState(progress),
    elapsedSeconds: progress.solvedAt || progress.failedAt
      ? progress.elapsedSeconds ?? 0
      : getSolveElapsedSeconds(progress.startedAt, progress.hintsRevealed),
    startedAt: progress.startedAt,
  };
}
