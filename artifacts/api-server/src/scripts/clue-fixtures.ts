import { and, eq, inArray, like } from "drizzle-orm";
import {
  assertFixtureEnvironment,
  buildClueFixtureProgress,
  CLUE_FIXTURE_MARKER,
  clueFixtureDefinitions,
  getClueFixtureSlug,
  getClueFixtureSlugPrefix,
} from "../lib/clue-test-fixtures";

type Operation = "seed" | "cleanup";

function readOperation(value: string | undefined): Operation {
  if (value === "seed" || value === "cleanup") return value;
  throw new Error("Choose exactly one operation: seed or cleanup.");
}

async function run(): Promise<void> {
  const operation = readOperation(process.argv[2]);
  const userId = process.env.CLUE_FIXTURE_USER_ID;
  assertFixtureEnvironment(
    operation,
    process.env.NODE_ENV,
    userId,
    process.env.CLUE_FIXTURES_CONFIRM,
  );

  const { db, pool, cluesTable, solverProgressTable, userProfilesTable } = await import("@workspace/db");
  try {
    if (operation === "seed") {
      const [profile] = await db
        .select({
          publicId: userProfilesTable.publicId,
          onboardingComplete: userProfilesTable.onboardingComplete,
        })
        .from(userProfilesTable)
        .where(eq(userProfilesTable.userId, userId))
        .limit(1);
      if (!profile) {
        throw new Error("No Clue Sprint profile exists for this Clerk user. Sign in and finish profile setup first.");
      }
      if (!profile.onboardingComplete) {
        throw new Error("Finish profile setup in Clue Sprint before seeding fixtures.");
      }

      const slugPrefix = getClueFixtureSlugPrefix(userId);
      const now = new Date();
      const result = await db.transaction(async (tx) => {
        const prefixMatches = await tx
          .select({ id: cluesTable.id, slug: cluesTable.slug, clue: cluesTable.clue })
          .from(cluesTable)
          .where(and(
            eq(cluesTable.setterUserId, userId),
            like(cluesTable.slug, `${slugPrefix}%`),
          ));
        const fixtureMatches = prefixMatches.filter(({ clue }) => clue.startsWith(CLUE_FIXTURE_MARKER));
        if (prefixMatches.length !== fixtureMatches.length) {
          throw new Error("A non-fixture clue uses this account's fixture slug prefix; no rows were changed.");
        }

        if (fixtureMatches.length) {
          await tx.delete(cluesTable).where(inArray(cluesTable.id, fixtureMatches.map(({ id }) => id)));
        }

        const insertedClues = await tx
          .insert(cluesTable)
          .values(clueFixtureDefinitions.map((fixture, index) => ({
            slug: getClueFixtureSlug(userId, index + 1),
            clue: `${CLUE_FIXTURE_MARKER} ${String(index + 1).padStart(2, "0")} — ${fixture.clue}`,
            answer: fixture.answer,
            normalizedAnswer: fixture.answer.toLocaleUpperCase("en").replace(/[^A-Z0-9]/g, ""),
            wordplay: fixture.wordplay,
            hints: fixture.hints,
            maxAttempts: fixture.maxAttempts,
            setterUserId: userId,
            setterName: profile.publicId,
            createdAt: new Date(now.getTime() - index * 60_000),
          })))
          .returning({ id: cluesTable.id });

        const fixtureProgress = buildClueFixtureProgress(userId, now);
        await tx.insert(solverProgressTable).values(fixtureProgress.map((entry) => ({
          clueId: insertedClues[entry.clueIndex - 1]!.id,
          userId: entry.userId,
          displayName: entry.displayName,
          attemptsUsed: entry.attemptsUsed,
          hintsRevealed: entry.hintsRevealed,
          assistEnabled: entry.assistEnabled,
          startedAt: entry.startedAt,
          solvedAt: entry.solvedAt,
          failedAt: entry.failedAt,
          elapsedSeconds: entry.elapsedSeconds,
        })));

        return { clueCount: insertedClues.length, progressCount: fixtureProgress.length };
      });

      process.stdout.write(
        `Seeded ${result.clueCount} Clue Sprint test clues and ${result.progressCount} synthetic solver runs for ${userId}. Existing profile data was read only.\n`,
      );
      return;
    }

    const slugPrefix = getClueFixtureSlugPrefix(userId);
    const result = await db.transaction(async (tx) => {
      const prefixMatches = await tx
        .select({ id: cluesTable.id, clue: cluesTable.clue })
        .from(cluesTable)
        .where(and(
          eq(cluesTable.setterUserId, userId),
          like(cluesTable.slug, `${slugPrefix}%`),
        ));
      const fixtureIds = prefixMatches
        .filter(({ clue }) => clue.startsWith(CLUE_FIXTURE_MARKER))
        .map(({ id }) => id);
      if (!fixtureIds.length) return { clueCount: 0 };
      await tx.delete(cluesTable).where(inArray(cluesTable.id, fixtureIds));
      return { clueCount: fixtureIds.length };
    });

    process.stdout.write(
      `Removed ${result.clueCount} Clue Sprint test clues for ${userId}; related solver-progress rows were removed by the clue foreign-key cascade.\n`,
    );
  } finally {
    await pool.end();
  }
}

run().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
