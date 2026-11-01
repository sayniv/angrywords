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
  selectManagedClueFixtures,
} from "../src/lib/clue-test-fixtures.ts";

const userId = "user_test_account_123";

test("fixture clues cover varied answer lengths, attempts, and hint counts", () => {
  assert.equal(CLUE_FIXTURE_COUNT, 100);
  assert.equal(clueFixtureDefinitions.length, 100);
  assert.equal(new Set(clueFixtureDefinitions.map(({ answer }) => answer)).size, CLUE_FIXTURE_COUNT);
  assert.equal(new Set(clueFixtureDefinitions.map(({ clue }) => clue)).size, CLUE_FIXTURE_COUNT);
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
  const slugs = Array.from({ length: CLUE_FIXTURE_COUNT }, (_, index) =>
    getClueFixtureSlug(userId, index + 1),
  );
  assert.equal(new Set(slugs).size, CLUE_FIXTURE_COUNT);
  assert.ok(slugs.every((value) => value.length <= 16));
  assert.equal(getClueFixtureSlug(userId, 100).length, 15);
  assert.throws(() => getClueFixtureSlug(userId, 0), /between 1 and 100/);
  assert.throws(() => getClueFixtureSlug(userId, 101), /between 1 and 100/);
});

test("fixture definitions and account-scoped identifiers are stable across seed reruns", () => {
  const firstSeed = clueFixtureDefinitions.map((fixture, index) => ({
    ...fixture,
    slug: getClueFixtureSlug(userId, index + 1),
  }));
  const secondSeed = clueFixtureDefinitions.map((fixture, index) => ({
    ...fixture,
    slug: getClueFixtureSlug(userId, index + 1),
  }));
  assert.deepEqual(secondSeed, firstSeed);
});

test("managed fixture selection excludes unrelated clues and other accounts", () => {
  const prefix = getClueFixtureSlugPrefix(userId);
  const otherUserId = "user_other_test_account";
  const candidates = [
    {
      id: 1,
      slug: `${prefix}01`,
      clue: `${CLUE_FIXTURE_MARKER} 01 — managed fixture`,
      setterUserId: userId,
    },
    {
      id: 2,
      slug: `${prefix}02`,
      clue: "An unrelated clue with a coincidental fixture slug",
      setterUserId: userId,
    },
    {
      id: 3,
      slug: `${prefix}03`,
      clue: `${CLUE_FIXTURE_MARKER} 03 — another account's clue`,
      setterUserId: otherUserId,
    },
    {
      id: 4,
      slug: `${getClueFixtureSlugPrefix(otherUserId)}01`,
      clue: `${CLUE_FIXTURE_MARKER} 01 — another account's fixture`,
      setterUserId: otherUserId,
    },
  ];

  assert.deepEqual(
    selectManagedClueFixtures(candidates, userId).map(({ id }) => id),
    [1],
  );
});

test("seed collision checks can distinguish managed fixtures from unmarked clues", () => {
  const prefix = getClueFixtureSlugPrefix(userId);
  const prefixMatches = [
    {
      id: 1,
      slug: `${prefix}01`,
      clue: `${CLUE_FIXTURE_MARKER} 01 — managed fixture`,
      setterUserId: userId,
    },
    {
      id: 2,
      slug: `${prefix}02`,
      clue: "A regular clue that happens to share the reserved prefix",
      setterUserId: userId,
    },
  ];
  assert.equal(selectManagedClueFixtures(prefixMatches, userId).length, 1);
  assert.notEqual(
    selectManagedClueFixtures(prefixMatches, userId).length,
    prefixMatches.length,
  );
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
