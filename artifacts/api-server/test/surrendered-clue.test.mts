import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  getClueSolution,
  getClueProgressState,
  getCompletedAttemptResult,
  hasSuccessfulSolve,
} from "../src/lib/clue-progress.ts";
import { getSavedAttemptResult } from "../../clue-sprint/src/lib/saved-attempt-result.ts";
import {
  getDashboardActivityScope,
  getSolverActivityState,
  getSolverProgressScope,
  serializeSolverActivity,
} from "../src/lib/solver-activity.ts";

const postgresDialect = new PgDialect();
const solution = {
  answer: "SUNSET",
  wordplay: "Sun + set makes sunset.",
};

test("signed-out visitors and solvers with active runs do not receive the solution", () => {
  assert.deepEqual(getClueSolution(undefined, false, solution), {
    revealedAnswer: null,
    wordplay: null,
  });
  assert.deepEqual(
    getClueSolution(
      { solvedAt: null, failedAt: null },
      false,
      solution,
    ),
    {
      revealedAnswer: null,
      wordplay: null,
    },
  );
});

test("the solution is returned only for a completed solve or failure", () => {
  const solvedAt = new Date("2026-11-01T12:00:00.000Z");
  const failedAt = new Date("2026-11-01T12:00:00.000Z");
  const revealed = {
    revealedAnswer: solution.answer,
    wordplay: solution.wordplay,
  };

  assert.deepEqual(
    getClueSolution({ solvedAt, failedAt: null }, false, solution),
    revealed,
  );
  assert.deepEqual(
    getClueSolution({ solvedAt: null, failedAt }, false, solution),
    revealed,
  );
});

test("dashboard activity and clue progress queries are scoped to the signed-in solver", () => {
  const dashboardScope = postgresDialect.sqlToQuery(
    getDashboardActivityScope("solver-account"),
  );
  assert.match(
    dashboardScope.sql,
    /"solver_progress"\."user_id" = \$\d+/,
  );
  assert.ok(dashboardScope.params.includes("solver-account"));
  assert.match(dashboardScope.sql, /"clues"\."retired_at" is null/);

  const clueScope = postgresDialect.sqlToQuery(
    getSolverProgressScope(42, "solver-account"),
  );
  assert.match(
    clueScope.sql,
    /"solver_progress"\."clue_id" = \$\d+ and "solver_progress"\."user_id" = \$\d+/,
  );
  assert.deepEqual(clueScope.params, [42, "solver-account"]);
  assert.ok(!clueScope.params.includes("another-solver"));
});

test("dashboard activity distinguishes in-progress, solved, and failed runs", () => {
  assert.equal(
    getSolverActivityState({ solvedAt: null, failedAt: null }),
    "in-progress",
  );
  assert.equal(
    getSolverActivityState({
      solvedAt: new Date("2026-11-01T12:00:00.000Z"),
      failedAt: null,
    }),
    "solved",
  );
  assert.equal(
    getSolverActivityState({
      solvedAt: null,
      failedAt: new Date("2026-11-01T12:00:00.000Z"),
    }),
    "failed",
  );
});

test("activity serialization preserves older-run attempt counts and result state", () => {
  const clue = {
    id: 84,
    slug: "older-clue",
    clue: "A historic puzzle",
    answer: "OLD ANSWER",
    maxAttempts: 6,
    setterName: "Setter",
  };
  const startedAt = new Date("2026-10-15T12:00:00.000Z");
  const solvedActivity = serializeSolverActivity(clue, {
    attemptsUsed: 4,
    solvedAt: new Date("2026-10-15T12:02:00.000Z"),
    failedAt: null,
    elapsedSeconds: 120,
    startedAt,
  });
  assert.equal(solvedActivity.attemptsUsed, 4);
  assert.equal(solvedActivity.attemptsRemaining, 2);
  assert.equal(solvedActivity.state, "solved");
  assert.equal(solvedActivity.elapsedSeconds, 120);
  assert.equal(solvedActivity.startedAt, startedAt);

  const failedActivity = serializeSolverActivity(clue, {
    attemptsUsed: 6,
    solvedAt: null,
    failedAt: new Date("2026-10-15T12:05:00.000Z"),
    elapsedSeconds: 300,
    startedAt,
  });
  assert.equal(failedActivity.attemptsUsed, 6);
  assert.equal(failedActivity.attemptsRemaining, 0);
  assert.equal(failedActivity.state, "failed");
  assert.equal(failedActivity.elapsedSeconds, 300);
});

test("a reloaded clue restores saved attempts and its in-progress result", () => {
  assert.deepEqual(
    getSavedAttemptResult({
      userCompleted: false,
      userAttemptsUsed: 2,
      userElapsedSeconds: 31,
      userSolved: false,
      maxAttempts: 5,
    }),
    {
      correct: false,
      attemptsUsed: 2,
      attemptsRemaining: 3,
      completed: false,
      elapsedSeconds: 31,
      message: "Your progress is saved. Keep going.",
    },
  );
});

test("a reloaded solved clue restores the completed success result", () => {
  assert.deepEqual(
    getSavedAttemptResult({
      userCompleted: true,
      userAttemptsUsed: 3,
      userElapsedSeconds: 64,
      userSolved: true,
      maxAttempts: 5,
    }),
    {
      correct: true,
      attemptsUsed: 3,
      attemptsRemaining: 0,
      completed: true,
      elapsedSeconds: 64,
      message: "You already solved this clue.",
    },
  );
});

test("a reloaded failed clue restores the completed failure result", () => {
  assert.deepEqual(
    getSavedAttemptResult({
      userCompleted: true,
      userAttemptsUsed: 5,
      userElapsedSeconds: 88,
      userSolved: false,
      maxAttempts: 5,
    }),
    {
      correct: false,
      attemptsUsed: 5,
      attemptsRemaining: 0,
      completed: true,
      elapsedSeconds: 88,
      message: "No attempts remain for this clue.",
    },
  );
});

test("a surrendered run stays failed and reveals its solution after reload", () => {
  const progress = {
    solvedAt: null,
    failedAt: new Date("2026-11-01T12:00:00.000Z"),
    attemptsUsed: 0,
    elapsedSeconds: 18,
  };
  const clueState = getClueProgressState(progress, false);

  assert.deepEqual(clueState, {
    userCompleted: true,
    userSolved: false,
    revealSolution: true,
  });

  const savedResult = getSavedAttemptResult({
    ...clueState,
    userAttemptsUsed: progress.attemptsUsed,
    userElapsedSeconds: progress.elapsedSeconds,
    maxAttempts: 5,
  });

  assert.deepEqual(savedResult, {
    correct: false,
    attemptsUsed: 0,
    attemptsRemaining: 0,
    completed: true,
    elapsedSeconds: 18,
    message: "You gave up. The answer and wordplay are revealed.",
  });
});

test("a later guess cannot change a surrendered run or make it rateable", () => {
  const progress = {
    solvedAt: null,
    failedAt: new Date("2026-11-01T12:00:00.000Z"),
    attemptsUsed: 0,
    elapsedSeconds: 18,
  };
  const nextResult = getCompletedAttemptResult(progress, 5, 18);

  assert.deepEqual(nextResult, {
    correct: false,
    attemptsUsed: 0,
    attemptsRemaining: 0,
    completed: true,
    elapsedSeconds: 18,
    message: "You gave up. The answer and wordplay are revealed.",
  });
  assert.equal(progress.attemptsUsed, 0);
  assert.equal(hasSuccessfulSolve(progress), false);
});
