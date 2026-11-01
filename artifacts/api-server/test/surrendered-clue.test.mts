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
import {
  CLUE_HINT_PENALTY_SECONDS,
  getNextClueHint,
  getPreviouslyRevealedHints,
  getSolveElapsedSeconds,
  isActiveSolve,
  normalizeClueHints,
} from "../src/lib/clue-hints.ts";
import { CreateClueBody } from "@workspace/api-zod";
import { confirmHintReveal } from "../../clue-sprint/src/lib/hint-confirmation.ts";
import { getGuessFeedback } from "../src/lib/guess-feedback.ts";
import { StartClueBody, StartClueResponse, SubmitAttemptResponse } from "@workspace/api-zod";

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
    hintsRevealed: 0,
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
    hintsRevealed: 0,
  });
  assert.equal(failedActivity.attemptsUsed, 6);
  assert.equal(failedActivity.attemptsRemaining, 0);
  assert.equal(failedActivity.state, "failed");
  assert.equal(failedActivity.elapsedSeconds, 300);

  const activeWithHints = serializeSolverActivity(clue, {
    attemptsUsed: 1,
    solvedAt: null,
    failedAt: null,
    elapsedSeconds: null,
    startedAt: new Date(Date.now() - 10_000),
    hintsRevealed: 2,
  });
  assert.ok(activeWithHints.elapsedSeconds >= 2 * CLUE_HINT_PENALTY_SECONDS);
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

test("hint authoring accepts zero to three trimmed hints and rejects blanks or excess entries", () => {
  assert.deepEqual(normalizeClueHints(undefined), { valid: true, hints: [] });
  assert.deepEqual(normalizeClueHints(["  first hint ", "second"]), {
    valid: true,
    hints: ["first hint", "second"],
  });
  assert.equal(normalizeClueHints(["one", " ", "three"]).valid, false);
  assert.equal(normalizeClueHints(["a", "b", "c", "d"]).valid, false);
  assert.equal(normalizeClueHints(["x".repeat(301)]).valid, false);

  const input = {
    clue: "A clue",
    answer: "WORD",
    wordplay: "An explanation",
    maxAttempts: 5,
  };
  assert.equal(CreateClueBody.safeParse({ ...input, hints: ["one", "two", "three"] }).success, true);
  assert.equal(CreateClueBody.safeParse({ ...input, hints: ["one", "two", "three", "four"] }).success, false);
  assert.equal(CreateClueBody.safeParse({ ...input, hints: [""] }).success, false);
});

test("hint reveal returns hints in order and reload state contains only previously revealed hints", () => {
  const hints = ["Look at the first word.", "Try splitting the answer.", "Check the ending."];
  assert.equal(getNextClueHint(hints, 0), hints[0]);
  assert.equal(getNextClueHint(hints, 1), hints[1]);
  assert.equal(getNextClueHint(hints, 3), null);

  // The persisted reveal count is enough to restore prior use without exposing later hints.
  const persistedRevealCount = 2;
  assert.deepEqual(getPreviouslyRevealedHints(hints, persistedRevealCount), hints.slice(0, 2));
  assert.deepEqual(getPreviouslyRevealedHints(hints, 0), []);
  assert.equal(isActiveSolve(undefined), false);
  assert.equal(isActiveSolve({ solvedAt: new Date(), failedAt: null }), false);
  assert.equal(isActiveSolve({ solvedAt: null, failedAt: new Date() }), false);
  assert.equal(isActiveSolve({ solvedAt: null, failedAt: null }), true);
});

test("each revealed hint adds one minute to live and completed solve time", () => {
  const start = new Date("2026-11-01T12:00:00.000Z");
  const now = start.getTime() + 75_500;
  assert.equal(getSolveElapsedSeconds(start, 0, now), 75);
  assert.equal(getSolveElapsedSeconds(start, 1, now), 75 + CLUE_HINT_PENALTY_SECONDS);
  assert.equal(getSolveElapsedSeconds(start, 2, now), 75 + 2 * CLUE_HINT_PENALTY_SECONDS);
  assert.equal(getSolveElapsedSeconds(new Date(now + 1000), 1, now), CLUE_HINT_PENALTY_SECONDS);
});

test("cancelling the hint confirmation calls no reveal action; confirming calls it once", async () => {
  let reveals = 0;
  const cancelled = await confirmHintReveal(
    () => false,
    async () => { reveals += 1; return "secret"; },
  );
  assert.equal(cancelled, undefined);
  assert.equal(reveals, 0);

  const confirmed = await confirmHintReveal(
    () => true,
    async () => { reveals += 1; return "secret"; },
  );
  assert.equal(confirmed, "secret");
  assert.equal(reveals, 1);
});

test("assist feedback marks exact, misplaced, and absent letters without returning the answer", () => {
  const target = "APPLE";
  const feedback = getGuessFeedback("ALLEY", target);
  assert.deepEqual(feedback, ["green", "yellow", "neutral", "yellow", "neutral"]);
  assert.equal(JSON.stringify(feedback).includes(target), false);
  assert.deepEqual(getGuessFeedback("APPLE", target), ["green", "green", "green", "green", "green"]);
});

test("repeated target letters are consumed once after green matches", () => {
  assert.deepEqual(getGuessFeedback("BBB", "ABB"), ["neutral", "green", "green"]);
  assert.deepEqual(getGuessFeedback("AAB", "ABA"), ["green", "yellow", "yellow"]);
});

test("assist-mode API schemas default legacy starts to off and keep feedback optional", () => {
  assert.deepEqual(StartClueBody.parse({}), { assistEnabled: false });
  assert.deepEqual(StartClueBody.parse({ assistEnabled: true }), { assistEnabled: true });
  assert.equal(
    StartClueResponse.parse({
      attemptsUsed: 0,
      attemptsRemaining: 5,
      completed: false,
      elapsedSeconds: 0,
      startedAt: new Date("2026-11-01T12:00:00.000Z"),
      assistEnabled: true,
    }).assistEnabled,
    true,
  );
  const noAssistResult = SubmitAttemptResponse.parse({
    correct: false,
    attemptsUsed: 1,
    attemptsRemaining: 4,
    completed: false,
    elapsedSeconds: 5,
  });
  assert.equal("feedback" in noAssistResult, false);
  const assistResult = SubmitAttemptResponse.parse({
    correct: false,
    attemptsUsed: 1,
    attemptsRemaining: 4,
    completed: false,
    elapsedSeconds: 5,
    feedback: ["green", "yellow", "neutral"],
  });
  assert.deepEqual(assistResult.feedback, ["green", "yellow", "neutral"]);
});
