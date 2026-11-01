import assert from "node:assert/strict";
import test from "node:test";
import {
  assertFixtureEnvironment,
  buildClueFixtureProgress,
  CLUE_FIXTURE_COUNT,
  CLUE_FIXTURE_MARKER,
  clueFixtureDefinitions,
  getClueFixtureSlug,
  getClueFixtureSlugPrefix,
} from "../src/lib/clue-test-fixtures.ts";

const userId = "user_test_account_123";

test("fixture clues cover varied answer lengths, attempts, and hint counts", () => {
  assert.equal(clueFixtureDefinitions.length, CLUE_FIXTURE_COUNT);
  assert.ok(new Set(clueFixtureDefinitions.map(({ answer }) => answer.length)).size >= 5);
  assert.ok(new Set(clueFixtureDefinitions.map(({ maxAttempts }) => maxAttempts)).size >= 4);
  assert.deepEqual(
    [...new Set(clueFixtureDefinitions.map(({ hints }) => hints.length))].sort(),
    [0, 1, 2, 3],
  );
  assert.ok(clueFixtureDefinitions.every(({ clue, answer, hints }) =>
    clue.length > 0 && answer.length > 0 && hints.every((hint) => hint.length > 0),
  ));
});

test("fixture slugs are deterministic, account-scoped, and within the schema limit", () => {
  const slug = getClueFixtureSlug(userId, 1);
  assert.equal(slug, getClueFixtureSlug(userId, 1));
  assert.notEqual(slug, getClueFixtureSlug("user_someone_else", 1));
  assert.equal(slug.length, 14);
  assert.ok(slug.startsWith(getClueFixtureSlugPrefix(userId)));
  assert.throws(() => getClueFixtureSlug(userId, 0), /between 1 and 20/);
});

test("seed and cleanup require an explicit existing Clerk-style ID and operation confirmation", () => {
  assertFixtureEnvironment("seed", "development", userId, "YES_SEED");
  assertFixtureEnvironment("cleanup", "test", userId, "YES_CLEANUP");
  assert.throws(
    () => assertFixtureEnvironment("seed", "production", userId, "YES_SEED"),
    /only when NODE_ENV is development or test/,
  );
  assert.throws(
    () => assertFixtureEnvironment("seed", "development", undefined, "YES_SEED"),
    /existing Clerk test account/,
  );
  assert.throws(
    () => assertFixtureEnvironment("seed", "development", userId, "YES_CLEANUP"),
    /YES_SEED/,
  );
});

test("synthetic progress has independently ranked tiers plus failed and in-progress examples", () => {
  const progress = buildClueFixtureProgress(userId, new Date("2026-11-01T12:00:00.000Z"));
  const featured = progress.filter(({ clueIndex }) => clueIndex === 4);
  assert.equal(featured.length, 9);
  assert.deepEqual(
    featured.filter(({ assistEnabled, hintsRevealed }) => !assistEnabled && hintsRevealed === 0)
      .map(({ elapsedSeconds }) => elapsedSeconds),
    [82, 119, 164],
  );
  assert.deepEqual(
    featured.filter(({ assistEnabled, hintsRevealed }) => !assistEnabled && hintsRevealed > 0)
      .map(({ elapsedSeconds }) => elapsedSeconds),
    [132, 188, 247],
  );
  assert.deepEqual(
    featured.filter(({ assistEnabled }) => assistEnabled)
      .map(({ elapsedSeconds }) => elapsedSeconds),
    [101, 153, 216],
  );

  const incomplete = progress.find(({ solvedAt, failedAt }) => solvedAt === null && failedAt === null);
  const failed = progress.find(({ failedAt }) => failedAt !== null);
  assert.ok(incomplete);
  assert.ok(failed);
  assert.ok(progress.every(({ userId }) => userId.startsWith("clue-fixture-solver-")));
  assert.equal(incomplete.elapsedSeconds, null);
  assert.equal(failed.solvedAt, null);
  assert.ok(clueFixtureDefinitions.every(({ clue }) => !clue.startsWith(CLUE_FIXTURE_MARKER)));
});
