import assert from "node:assert/strict";
import test from "node:test";
import {
  getClueProgressState,
  getCompletedAttemptResult,
  hasSuccessfulSolve,
} from "../src/lib/clue-progress.ts";
import { getSavedAttemptResult } from "../../clue-sprint/src/lib/saved-attempt-result.ts";

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
