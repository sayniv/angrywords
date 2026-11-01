import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClueLeaderboardEntries,
  type ClueLeaderboardRow,
} from "../src/lib/clue-leaderboard.ts";
import { GetClueLeaderboardResponse } from "@workspace/api-zod";

const solvedAt = (second: number) =>
  new Date(`2026-11-01T12:00:${String(second).padStart(2, "0")}.000Z`);

function row(overrides: Partial<ClueLeaderboardRow> = {}): ClueLeaderboardRow {
  return {
    userId: "solver",
    elapsedSeconds: 100,
    attemptsUsed: 2,
    hintsRevealed: 0,
    solvedAt: solvedAt(0),
    failedAt: null,
    ...overrides,
  };
}

test("clue solves are separated by hint use and ranked independently", () => {
  const entries = buildClueLeaderboardEntries(
    [
      row({ userId: "no-hint-slower", elapsedSeconds: 180, solvedAt: solvedAt(3) }),
      row({ userId: "no-hint-fastest", elapsedSeconds: 120, solvedAt: solvedAt(4) }),
      row({ userId: "hint-fastest", elapsedSeconds: 240, hintsRevealed: 1, solvedAt: solvedAt(2) }),
      row({ userId: "hint-two-reveals", elapsedSeconds: 300, hintsRevealed: 3, solvedAt: solvedAt(1) }),
    ],
    new Map([
      ["no-hint-slower", "No Hint Slower"],
      ["no-hint-fastest", "No Hint Fastest"],
      ["hint-fastest", "Hint Fastest"],
      ["hint-two-reveals", "Used Several Hints"],
    ]),
  );

  assert.deepEqual(entries.noHints.map(({ rank, displayName }) => [rank, displayName]), [
    [1, "No Hint Fastest"],
    [2, "No Hint Slower"],
  ]);
  assert.deepEqual(entries.hintsUsed.map(({ rank, displayName }) => [rank, displayName]), [
    [1, "Hint Fastest"],
    [2, "Used Several Hints"],
  ]);
});

test("attempt count and solve time break ties within each category", () => {
  const entries = buildClueLeaderboardEntries(
    [
      row({ userId: "later-solve", elapsedSeconds: 120, attemptsUsed: 2, solvedAt: solvedAt(2) }),
      row({ userId: "fewer-attempts", elapsedSeconds: 120, attemptsUsed: 1, solvedAt: solvedAt(3) }),
      row({ userId: "earlier-solve", elapsedSeconds: 120, attemptsUsed: 1, solvedAt: solvedAt(1) }),
    ],
    new Map(),
  );

  assert.deepEqual(entries.noHints.map(({ rank, displayName }) => [rank, displayName]), [
    [1, "Guest solver"],
    [2, "Guest solver"],
    [3, "Guest solver"],
  ]);
  assert.deepEqual(
    entries.noHints.map(({ attemptsUsed, solvedAt: time }) => [attemptsUsed, time.getTime()]),
    [
      [1, solvedAt(1).getTime()],
      [1, solvedAt(3).getTime()],
      [2, solvedAt(2).getTime()],
    ],
  );
  assert.deepEqual(entries.hintsUsed, []);
});

test("incomplete, failed, and surrendered runs are excluded and empty categories remain present", () => {
  const entries = buildClueLeaderboardEntries(
    [
      row({ userId: "in-progress", solvedAt: null }),
      row({ userId: "failed", solvedAt: null, failedAt: solvedAt(1) }),
      row({ userId: "surrendered", solvedAt: null, failedAt: solvedAt(2), hintsRevealed: 2 }),
    ],
    new Map(),
  );

  assert.deepEqual(entries, { noHints: [], hintsUsed: [] });
});

test("hint penalties are retained in the recorded leaderboard time", () => {
  const entries = buildClueLeaderboardEntries(
    [row({ elapsedSeconds: 245, hintsRevealed: 2 })],
    new Map([["solver", "Hint Solver"]]),
  );

  assert.equal(entries.hintsUsed[0]?.elapsedSeconds, 245);
  assert.equal(entries.noHints.length, 0);
});

test("the clue leaderboard API contract includes both empty and populated categories", () => {
  const parsed = GetClueLeaderboardResponse.parse({
    noHints: [],
    hintsUsed: [{
      rank: 1,
      displayName: "Hint Solver",
      elapsedSeconds: 245,
      attemptsUsed: 2,
      solvedAt: solvedAt(0),
    }],
  });

  assert.deepEqual(parsed.noHints, []);
  assert.equal(parsed.hintsUsed.length, 1);
  assert.equal(parsed.hintsUsed[0]?.displayName, "Hint Solver");
});
