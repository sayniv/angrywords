import { and, eq, isNull } from "drizzle-orm";
import { cluesTable, solverProgressTable } from "@workspace/db/schema";

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
