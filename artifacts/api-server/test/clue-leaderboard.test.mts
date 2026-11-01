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
    assistEnabled: false,
    solvedAt: solvedAt(0),
    failedAt: null,
    ...overrides,
  };
}

test("clue solves are divided into no-assist and assist tiers and ranked independently", () => {
  const entries = buildClueLeaderboardEntries(
    [
      row({ userId: "no-hint-slower", elapsedSeconds: 180, solvedAt: solvedAt(3) }),
      row({ userId: "no-hint-fastest", elapsedSeconds: 120, solvedAt: solvedAt(4) }),
      row({ userId: "hint-fastest", elapsedSeconds: 240, hintsRevealed: 1, solvedAt: solvedAt(2) }),
      row({ userId: "hint-two-reveals", elapsedSeconds: 300, hintsRevealed: 3, solvedAt: solvedAt(1) }),
      row({ userId: "assist-no-hints", elapsedSeconds: 90, assistEnabled: true }),
      row({ userId: "assist-with-hints", elapsedSeconds: 110, hintsRevealed: 2, assistEnabled: true }),
    ],
    new Map([
      ["no-hint-slower", "No Hint Slower"],
      ["no-hint-fastest", "No Hint Fastest"],
      ["hint-fastest", "Hint Fastest"],
      ["hint-two-reveals", "Used Several Hints"],
      ["assist-no-hints", "Assist without hints"],
      ["assist-with-hints", "Assist with hints"],
    ]),
  );

  assert.deepEqual(entries.noHintsNoAssist.map(({ rank, displayName }) => [rank, displayName]), [
    [1, "No Hint Fastest"],
    [2, "No Hint Slower"],
  ]);
  assert.deepEqual(entries.hintsUsedNoAssist.map(({ rank, displayName }) => [rank, displayName]), [
    [1, "Hint Fastest"],
    [2, "Used Several Hints"],
  ]);
  assert.deepEqual(entries.assistUsed.map(({ rank, displayName }) => [rank, displayName]), [
    [1, "Assist without hints"],
    [2, "Assist with hints"],
  ]);
});

test("each leaderboard category keeps its own 50 fastest eligible solves", () => {
  const noHintSolves = Array.from({ length: 60 }, (_, index) =>
    row({
      userId: `no-hint-${index}`,
      elapsedSeconds: 100 + index,
      solvedAt: solvedAt(index),
    }),
  );
  const hintedSolves = Array.from({ length: 60 }, (_, index) =>
    row({
      userId: `hinted-${index}`,
      elapsedSeconds: 200 + index,
      hintsRevealed: 1,
      solvedAt: solvedAt(index),
    }),
  );
  const assistSolves = Array.from({ length: 60 }, (_, index) =>
    row({
      userId: `assist-${index}`,
      elapsedSeconds: 300 + index,
      hintsRevealed: index % 2,
      assistEnabled: true,
      solvedAt: solvedAt(index),
    }),
  );

  const entries = buildClueLeaderboardEntries(
    [...noHintSolves, ...hintedSolves, ...assistSolves].reverse(),
    new Map(),
    "no-hint-59",
  );

  assert.equal(entries.noHintsNoAssist.length, 50);
  assert.equal(entries.hintsUsedNoAssist.length, 50);
  assert.equal(entries.assistUsed.length, 50);
  assert.deepEqual(
    entries.noHintsNoAssist.map(({ rank, elapsedSeconds }) => [rank, elapsedSeconds]),
    Array.from({ length: 50 }, (_, index) => [index + 1, 100 + index]),
  );
  assert.equal(entries.noHintsNoAssist.some(({ isCurrentUser }) => isCurrentUser), false);
  assert.deepEqual(
    entries.hintsUsedNoAssist.map(({ rank, elapsedSeconds }) => [rank, elapsedSeconds]),
    Array.from({ length: 50 }, (_, index) => [index + 1, 200 + index]),
  );
  assert.deepEqual(
    entries.assistUsed.map(({ rank, elapsedSeconds }) => [rank, elapsedSeconds]),
    Array.from({ length: 50 }, (_, index) => [index + 1, 300 + index]),
  );
});

test("revealing hints places a no-assist solve only on the hints-used board", () => {
  const entries = buildClueLeaderboardEntries(
    [
      row({ userId: "without-hints", hintsRevealed: 0 }),
      row({ userId: "with-hints", hintsRevealed: 2 }),
      row({ userId: "assist-with-hints", hintsRevealed: 1, assistEnabled: true }),
    ],
    new Map([
      ["without-hints", "Without hints"],
      ["with-hints", "With hints"],
      ["assist-with-hints", "Assist with hints"],
    ]),
  );

  assert.deepEqual(entries.noHintsNoAssist.map(({ displayName }) => displayName), ["Without hints"]);
  assert.deepEqual(entries.hintsUsedNoAssist.map(({ displayName }) => displayName), ["With hints"]);
  assert.deepEqual(entries.assistUsed.map(({ displayName }) => displayName), ["Assist with hints"]);
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

  assert.deepEqual(entries.noHintsNoAssist.map(({ rank, displayName }) => [rank, displayName]), [
    [1, "Guest solver"],
    [2, "Guest solver"],
    [3, "Guest solver"],
  ]);
  assert.deepEqual(
    entries.noHintsNoAssist.map(({ attemptsUsed, solvedAt: time }) => [attemptsUsed, time.getTime()]),
    [
      [1, solvedAt(1).getTime()],
      [1, solvedAt(3).getTime()],
      [2, solvedAt(2).getTime()],
    ],
  );
  assert.deepEqual(entries.hintsUsedNoAssist, []);
  assert.deepEqual(entries.assistUsed, []);
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

  assert.deepEqual(entries, { noHintsNoAssist: [], hintsUsedNoAssist: [], assistUsed: [] });
});

test("hint penalties are retained in the recorded leaderboard time", () => {
  const entries = buildClueLeaderboardEntries(
    [row({ elapsedSeconds: 245, hintsRevealed: 2 })],
    new Map([["solver", "Hint Solver"]]),
  );

  assert.equal(entries.hintsUsedNoAssist[0]?.elapsedSeconds, 245);
  assert.equal(entries.noHintsNoAssist.length, 0);
});

test("only the authenticated viewer's own solve is marked without changing rank data", () => {
  const rows = [
    row({ userId: "other-solver", elapsedSeconds: 90, solvedAt: solvedAt(1) }),
    row({ userId: "current-solver", elapsedSeconds: 100, attemptsUsed: 3, solvedAt: solvedAt(2) }),
  ];
  const publicIds = new Map([
    ["other-solver", "Other solver"],
    ["current-solver", "Current solver"],
  ]);
  const entries = buildClueLeaderboardEntries(rows, publicIds, "current-solver");

  assert.deepEqual(
    entries.noHintsNoAssist.map(({ rank, displayName, elapsedSeconds, attemptsUsed, isCurrentUser }) =>
      [rank, displayName, elapsedSeconds, attemptsUsed, isCurrentUser]),
    [
      [1, "Other solver", 90, 2, undefined],
      [2, "Current solver", 100, 3, true],
    ],
  );
  assert.equal(buildClueLeaderboardEntries(rows, publicIds).noHintsNoAssist[1]?.isCurrentUser, undefined);
});

test("the clue leaderboard API contract includes empty and populated tiers", () => {
  const parsed = GetClueLeaderboardResponse.parse({
    noHintsNoAssist: [],
    hintsUsedNoAssist: [],
    assistUsed: [{
      rank: 3,
      displayName: "Hint Solver",
      elapsedSeconds: 117,
      attemptsUsed: 2,
      solvedAt: solvedAt(9),
      isCurrentUser: true,
    }],
  });

  assert.deepEqual(parsed.noHintsNoAssist, []);
  assert.deepEqual(parsed.hintsUsedNoAssist, []);
  assert.equal(parsed.assistUsed.length, 1);
  assert.equal(parsed.assistUsed[0]?.displayName, "Hint Solver");
  assert.equal(parsed.assistUsed[0]?.rank, 3);
  assert.equal(parsed.assistUsed[0]?.elapsedSeconds, 117);
  assert.equal(parsed.assistUsed[0]?.isCurrentUser, true);
  assert.equal(new Date(parsed.assistUsed[0]!.solvedAt).getTime(), solvedAt(9).getTime());
});
