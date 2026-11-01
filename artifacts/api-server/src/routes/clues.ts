import { randomBytes, randomInt } from "node:crypto";
import { Router, type IRouter, type RequestHandler } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { and, asc, avg, count, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import {
  AttemptResult,
  CreateClueBody,
  CreateClueResponse,
  GetCluePublishQuotaResponse,
  GetClueLeaderboardParams,
  GetClueLeaderboardResponse,
  GetClueParams,
  GetClueResponse,
  GetSetterLeaderboardResponse,
  GetSolverLeaderboardResponse,
  GetMyDashboardResponse,
  GetMyProfileResponse,
  ListCluesResponse,
  DeleteMyAccountBody,
  RetireClueParams,
  StartClueParams,
  StartClueResponse,
  SubmitAttemptBody,
  SubmitAttemptParams,
  SubmitAttemptResponse,
  RateClueBody,
  RateClueParams,
  RateClueResponse,
  ReportClueParams,
  ReportClueResponse,
  SubmitClueAppealBody,
  SubmitClueAppealParams,
  SubmitClueAppealResponse,
  ListPendingClueAppealsResponse,
  ReviewClueAppealBody,
  ReviewClueAppealParams,
  ReviewClueAppealResponse,
  UpdateMyProfileBody,
  UpdateMyProfileResponse,
  GetMyActivityQueryParams,
  GetMyActivityResponse,
  RevealClueHintResponse,
} from "@workspace/api-zod";
import {
  db,
  clueAppealsTable,
  clueReportsTable,
  clueRatingsTable,
  cluesTable,
  solverProgressTable,
  userProfilesTable,
  userPublicIdReservationsTable,
  type UserProfile,
} from "@workspace/db";
import { containsObjectionableLanguage } from "../lib/content-moderation";
import {
  DAILY_CLUE_PUBLISH_LIMIT,
  getUtcDayBounds,
  getSetterPublishLockSql,
  publishClueWithinDailyLimit,
} from "../lib/daily-clue-publishing";
import {
  getClueProgressState,
  getCompletedAttemptResult,
  hasSuccessfulSolve,
  getClueSolution,
} from "../lib/clue-progress";
import {
  getNextClueHint,
  getPreviouslyRevealedHints,
  getSolveElapsedSeconds,
  isActiveSolve,
  normalizeClueHints,
} from "../lib/clue-hints";
import {
  getDashboardActivityScope,
  getSolverProgressScope,
  serializeSolverActivity,
} from "../lib/solver-activity";
import { buildClueLeaderboardEntries } from "../lib/clue-leaderboard";

const router: IRouter = Router();
const CLUE_REPORT_BLOCK_THRESHOLD = 100;
const SOLVER_ACTIVITY_PAGE_SIZE = 10;
const REVIEWER_USER_IDS = new Set(
  (process.env.CLUE_REVIEWER_USER_IDS ?? "")
    .split(",")
    .map((userId) => userId.trim())
    .filter(Boolean),
);
const requireAuth: RequestHandler = (req, res, next) => {
  if (!getAuth(req).userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  next();
};

function normalizeAnswer(value: string): string {
  return value.toLocaleUpperCase("en").replace(/[^A-Z0-9]/g, "");
}

function requireReviewer(req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]): string | null {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return null;
  }
  if (!REVIEWER_USER_IDS.has(userId)) {
    res.status(403).json({ error: "Reviewer access is required." });
    return null;
  }
  return userId;
}

async function publicProfileResponse(profile: {
  userId: string;
  publicId: string;
  isGuest: boolean;
  onboardingComplete: boolean;
  blurb: string | null;
}) {
  const reservations = await db
    .select({ publicId: userPublicIdReservationsTable.publicId })
    .from(userPublicIdReservationsTable)
    .where(eq(userPublicIdReservationsTable.userId, profile.userId));
  const claimedPublicIds = new Set([
    profile.publicId,
    ...reservations.map((reservation) => reservation.publicId),
  ]);
  return {
    publicId: profile.publicId,
    claimedPublicIds: [...claimedPublicIds],
    isGuest: profile.isGuest,
    needsSetup: !profile.onboardingComplete,
    blurb: profile.blurb,
  };
}

class PublicIdAlreadyClaimedError extends Error {}
class AccountDeletionConfirmationError extends Error {}

async function ensureProfile(userId: string) {
  const [existing] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId))
    .limit(1);
  if (existing) return existing;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    // Time prefix plus a cryptographic suffix; the unique index remains the final
    // collision guard, and a collision simply retries with a fresh number.
    const guestNumber = BigInt(Date.now()) * 1_000n + BigInt(randomInt(0, 1_000));
    const publicId = `Guest ${guestNumber}`;
    let created: UserProfile | undefined;
    try {
      created = await db.transaction(async (tx) => {
        const [profile] = await tx
          .insert(userProfilesTable)
          .values({
            userId,
            publicId,
            normalizedPublicId: publicId.toLowerCase(),
            isGuest: true,
          })
          .onConflictDoNothing()
          .returning();
        if (!profile) return undefined;

        const [reservation] = await tx
          .insert(userPublicIdReservationsTable)
          .values({
            userId,
            normalizedPublicId: profile.normalizedPublicId,
            publicId: profile.publicId,
          })
          .onConflictDoNothing()
          .returning();
        if (!reservation) {
          const [owner] = await tx
            .select({ userId: userPublicIdReservationsTable.userId })
            .from(userPublicIdReservationsTable)
            .where(eq(userPublicIdReservationsTable.normalizedPublicId, profile.normalizedPublicId))
            .limit(1);
          if (owner?.userId !== userId) throw new PublicIdAlreadyClaimedError();
        }

        await tx
          .update(cluesTable)
          .set({ setterName: profile.publicId })
          .where(eq(cluesTable.setterUserId, userId));
        await tx
          .update(solverProgressTable)
          .set({ displayName: profile.publicId })
          .where(eq(solverProgressTable.userId, userId));
        return profile;
      });
    } catch (error) {
      if (!(error instanceof PublicIdAlreadyClaimedError)) throw error;
      continue;
    }
    if (created) {
      return created;
    }

    const [concurrent] = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, userId))
      .limit(1);
    if (concurrent) return concurrent;
  }
  throw new Error("Could not reserve a unique guest ID.");
}

async function publicIdsForUsers(userIds: string[]): Promise<Map<string, string>> {
  if (!userIds.length) return new Map();
  const profiles = await db
    .select({ userId: userProfilesTable.userId, publicId: userProfilesTable.publicId })
    .from(userProfilesTable)
    .where(inArray(userProfilesTable.userId, userIds));
  return new Map(profiles.map((profile) => [profile.userId, profile.publicId]));
}

async function publicProfilesForUsers(
  userIds: string[],
): Promise<Map<string, { publicId: string; blurb: string | null }>> {
  if (!userIds.length) return new Map();
  const profiles = await db
    .select({
      userId: userProfilesTable.userId,
      publicId: userProfilesTable.publicId,
      blurb: userProfilesTable.blurb,
    })
    .from(userProfilesTable)
    .where(inArray(userProfilesTable.userId, userIds));
  return new Map(profiles.map((profile) => [profile.userId, profile]));
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  return candidate.code === "23505" || candidate.cause?.code === "23505";
}

async function solveCounts(clueIds: number[]): Promise<Map<number, number>> {
  if (!clueIds.length) return new Map();
  const rows = await db
    .select({ clueId: solverProgressTable.clueId, total: count() })
    .from(solverProgressTable)
    .where(
      and(
        inArray(solverProgressTable.clueId, clueIds),
        isNotNull(solverProgressTable.solvedAt),
      ),
    )
    .groupBy(solverProgressTable.clueId);
  return new Map(rows.map((row) => [row.clueId, Number(row.total)]));
}

async function clueRatingSummaries(
  clueIds: number[],
): Promise<Map<number, { averageRating: number | null; ratingCount: number }>> {
  if (!clueIds.length) return new Map();
  const rows = await db
    .select({
      clueId: clueRatingsTable.clueId,
      averageRating: avg(clueRatingsTable.rating).as("average_rating"),
      ratingCount: count().as("rating_count"),
    })
    .from(clueRatingsTable)
    .where(inArray(clueRatingsTable.clueId, clueIds))
    .groupBy(clueRatingsTable.clueId);
  return new Map(
    rows.map((row) => [
      row.clueId,
      {
        averageRating: row.averageRating == null ? null : Number(row.averageRating),
        ratingCount: Number(row.ratingCount),
      },
    ]),
  );
}

router.get("/clues", async (req, res): Promise<void> => {
  const sortByRating = req.query.sort === "rating";
  const ratings = db
    .select({
      clueId: clueRatingsTable.clueId,
      averageRating: avg(clueRatingsTable.rating).as("average_rating"),
      ratingCount: count().as("rating_count"),
    })
    .from(clueRatingsTable)
    .groupBy(clueRatingsTable.clueId)
    .as("clue_rating_summary");
  const clues = await db
    .select({
      id: cluesTable.id,
      slug: cluesTable.slug,
      clue: cluesTable.clue,
      answer: cluesTable.answer,
      maxAttempts: cluesTable.maxAttempts,
      setterUserId: cluesTable.setterUserId,
      setterName: cluesTable.setterName,
      blockedAt: cluesTable.blockedAt,
      createdAt: cluesTable.createdAt,
      averageRating: ratings.averageRating,
      ratingCount: ratings.ratingCount,
    })
    .from(cluesTable)
    .leftJoin(ratings, eq(ratings.clueId, cluesTable.id))
    .where(and(isNull(cluesTable.retiredAt), isNull(cluesTable.blockedAt)))
    .orderBy(
      ...(sortByRating
        ? [
            sql`${ratings.averageRating} DESC NULLS LAST`,
            desc(ratings.ratingCount),
            desc(cluesTable.createdAt),
          ]
        : [desc(cluesTable.createdAt)]),
    )
    .limit(30);
  const counts = await solveCounts(clues.map((clue) => clue.id));
  const publicProfiles = await publicProfilesForUsers(clues.map((clue) => clue.setterUserId));
  const response = clues.map((clue) => ({
    id: clue.id,
    slug: clue.slug,
    clue: clue.clue,
    answerLength: normalizeAnswer(clue.answer).length,
    maxAttempts: clue.maxAttempts,
    setterName: publicProfiles.get(clue.setterUserId)?.publicId ?? clue.setterName,
    setterBlurb: publicProfiles.get(clue.setterUserId)?.blurb ?? null,
    solveCount: counts.get(clue.id) ?? 0,
    averageRating: clue.averageRating === null ? null : Number(clue.averageRating),
    ratingCount: Number(clue.ratingCount ?? 0),
    isBlocked: Boolean(clue.blockedAt),
    createdAt: clue.createdAt,
  }));
  res.json(ListCluesResponse.parse(response));
});

router.get("/clues/publishing-quota", requireAuth, async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const { start, end } = getUtcDayBounds(new Date());
  const [result] = await db
    .select({ total: count() })
    .from(cluesTable)
    .where(
      and(
        eq(cluesTable.setterUserId, userId),
        gte(cluesTable.createdAt, start),
        lt(cluesTable.createdAt, end),
      ),
    );
  const publishedToday = Number(result.total);
  res.json(
    GetCluePublishQuotaResponse.parse({
      limit: DAILY_CLUE_PUBLISH_LIMIT,
      publishedToday,
      remaining: Math.max(0, DAILY_CLUE_PUBLISH_LIMIT - publishedToday),
      resetsAt: end,
    }),
  );
});

router.post("/clues", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateClueBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const validatedHints = normalizeClueHints(parsed.data.hints);
  if (!validatedHints.valid) {
    res.status(400).json({ error: "Add between zero and three non-empty hints, each no longer than 300 characters." });
    return;
  }

  const auth = getAuth(req);
  const profile = await ensureProfile(auth.userId!);
  if (!profile.onboardingComplete) {
    res.status(409).json({ error: "Choose a public ID before publishing a clue." });
    return;
  }
  const answer = normalizeAnswer(parsed.data.answer);
  if (!answer) {
    res.status(400).json({ error: "The answer must contain at least one letter or number." });
    return;
  }
  if (
    containsObjectionableLanguage(parsed.data.clue) ||
    containsObjectionableLanguage(parsed.data.answer) ||
    containsObjectionableLanguage(parsed.data.wordplay ?? "") ||
    validatedHints.hints.some(containsObjectionableLanguage)
  ) {
    res.status(400).json({
      error: "Please remove profanity or hateful language from the clue, answer, wordplay, and hints.",
    });
    return;
  }

  type ClueTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
  const publishResult = await publishClueWithinDailyLimit<
    ClueTransaction,
    (typeof cluesTable)["$inferSelect"]
  >(
    {
      withSetterLock: (setterUserId, operation) =>
        db.transaction(async (tx) => {
          await tx.execute(getSetterPublishLockSql(setterUserId));
          return operation(tx);
        }),
      countPublished: async (tx, setterUserId, start, end) => {
        const [result] = await tx
          .select({ total: count() })
          .from(cluesTable)
          .where(
            and(
              eq(cluesTable.setterUserId, setterUserId),
              gte(cluesTable.createdAt, start),
              lt(cluesTable.createdAt, end),
            ),
          );
        return Number(result.total);
      },
    },
    auth.userId!,
    async (tx, createdAt) => {
      const [created] = await tx
        .insert(cluesTable)
        .values({
          slug: randomBytes(6).toString("hex"),
          clue: parsed.data.clue.trim(),
          answer: parsed.data.answer.trim(),
          normalizedAnswer: answer,
          wordplay: parsed.data.wordplay?.trim() || null,
          hints: validatedHints.hints,
          maxAttempts: parsed.data.maxAttempts,
          setterUserId: auth.userId!,
          setterName: profile.publicId,
          createdAt,
        })
        .returning();
      return created;
    },
  );

  if (!publishResult.allowed) {
    res.status(429).json({
      error:
        "You’ve reached your limit of 10 published clues today. You can publish again after 00:00 UTC.",
    });
    return;
  }
  const clue = publishResult.created;

  const response = {
    id: clue.id,
    slug: clue.slug,
    clue: clue.clue,
    answerLength: answer.length,
    wordplay: clue.wordplay,
    maxAttempts: clue.maxAttempts,
    setterName: clue.setterName,
    setterBlurb: profile.blurb,
    averageRating: null,
    ratingCount: 0,
    userRating: null,
    userHasReported: false,
    isOwner: true,
    createdAt: clue.createdAt,
    userAttemptsUsed: null,
    userCompleted: null,
    userElapsedSeconds: null,
    userStartedAt: null,
    userSolved: null,
    revealedAnswer: clue.answer,
    userRevealedHints: [],
    hintCount: clue.hints.length,
  };
  res.status(201).json(CreateClueResponse.parse(response));
});

router.delete("/clues/:slug", requireAuth, async (req, res): Promise<void> => {
  const params = RetireClueParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = getAuth(req).userId!;
  const [existing] = await db
    .select()
    .from(cluesTable)
    .where(eq(cluesTable.slug, params.data.slug))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Clue not found." });
    return;
  }
  if (existing.setterUserId !== userId) {
    res.status(403).json({ error: "Only the original setter can retire this clue." });
    return;
  }
  if (existing.retiredAt) {
    res.status(410).json({ error: "This clue has already been retired." });
    return;
  }

  const [retired] = await db
    .update(cluesTable)
    .set({ retiredAt: new Date() })
    .where(
      and(
        eq(cluesTable.id, existing.id),
        eq(cluesTable.setterUserId, userId),
        isNull(cluesTable.retiredAt),
      ),
    )
    .returning({ id: cluesTable.id });
  if (!retired) {
    res.status(410).json({ error: "This clue has already been retired." });
    return;
  }
  res.sendStatus(204);
});

router.get("/clues/:slug", async (req, res): Promise<void> => {
  const params = GetClueParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [clue] = await db
    .select()
    .from(cluesTable)
    .where(eq(cluesTable.slug, params.data.slug))
    .limit(1);
  if (!clue) {
    res.status(404).json({ error: "Clue not found." });
    return;
  }
  if (clue.retiredAt) {
    res.status(410).json({ error: "This clue has been retired by its setter." });
    return;
  }
  const userId = getAuth(req).userId;
  const isOwner = clue.setterUserId === userId;
  if (clue.blockedAt && !isOwner) {
    res.status(410).json({
      error: "This clue has been blocked after reaching 100 community reports.",
    });
    return;
  }

  const setterProfile =
    isOwner
      ? await ensureProfile(clue.setterUserId)
      : (await publicProfilesForUsers([clue.setterUserId])).get(clue.setterUserId);
  const [progress] = userId
    ? await db
        .select()
        .from(solverProgressTable)
        .where(getSolverProgressScope(clue.id, userId))
        .limit(1)
    : [];

  const currentElapsed =
    progress && !progress.solvedAt && !progress.failedAt
      ? getSolveElapsedSeconds(progress.startedAt, progress.hintsRevealed)
      : progress?.elapsedSeconds ?? null;
  const [ratingStats] = await db
    .select({
      averageRating: avg(clueRatingsTable.rating),
      ratingCount: count(),
    })
    .from(clueRatingsTable)
    .where(eq(clueRatingsTable.clueId, clue.id));
  const [userRatingRow] = userId
    ? await db
        .select({ rating: clueRatingsTable.rating })
        .from(clueRatingsTable)
        .where(
          and(
            eq(clueRatingsTable.clueId, clue.id),
            eq(clueRatingsTable.userId, userId),
          ),
        )
        .limit(1)
    : [];
  const [userReportRow] = userId
    ? await db
        .select({ id: clueReportsTable.id })
        .from(clueReportsTable)
        .where(
          and(
            eq(clueReportsTable.clueId, clue.id),
            eq(clueReportsTable.userId, userId),
          ),
        )
        .limit(1)
    : [];
  const [appeal] = isOwner && clue.blockedAt
    ? await db
        .select({
          status: clueAppealsTable.status,
          reason: clueAppealsTable.reason,
        })
        .from(clueAppealsTable)
        .where(eq(clueAppealsTable.clueId, clue.id))
        .orderBy(desc(clueAppealsTable.submittedAt))
        .limit(1)
    : [];
  const [reportSummary] = isOwner && clue.blockedAt
    ? await db
        .select({ reportCount: count() })
        .from(clueReportsTable)
        .where(eq(clueReportsTable.clueId, clue.id))
    : [];

  const progressState = getClueProgressState(progress, isOwner);
  const response = {
    id: clue.id,
    slug: clue.slug,
    clue: clue.clue,
    answerLength: normalizeAnswer(clue.answer).length,
    ...getClueSolution(progress, isOwner, {
      answer: clue.answer,
      wordplay: clue.wordplay,
    }),
    maxAttempts: clue.maxAttempts,
    setterName: setterProfile?.publicId ?? clue.setterName,
    setterBlurb: setterProfile?.blurb ?? null,
    averageRating:
      ratingStats?.averageRating == null ? null : Number(ratingStats.averageRating),
    ratingCount: Number(ratingStats?.ratingCount ?? 0),
    userRating: userRatingRow?.rating ?? null,
    userHasReported: Boolean(userReportRow),
    isOwner,
    createdAt: clue.createdAt,
    userAttemptsUsed: progress?.attemptsUsed ?? null,
    userCompleted: progressState.userCompleted,
    userElapsedSeconds: currentElapsed,
    userStartedAt: progress?.startedAt ?? null,
    userSolved: progressState.userSolved,
    userRevealedHints: progress
      ? getPreviouslyRevealedHints(clue.hints, progress.hintsRevealed)
      : [],
    hintCount: clue.hints.length,
    isBlocked: Boolean(clue.blockedAt),
    reportCount: reportSummary ? Number(reportSummary.reportCount) : null,
    appealStatus: appeal?.status ?? null,
    appealReason: appeal?.reason ?? null,
  };
  res.json(GetClueResponse.parse(response));
});

router.post("/clues/:slug/hints", requireAuth, async (req, res): Promise<void> => {
  const params = StartClueParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [clue] = await db
    .select()
    .from(cluesTable)
    .where(eq(cluesTable.slug, params.data.slug))
    .limit(1);
  if (!clue) {
    res.status(404).json({ error: "Clue not found." });
    return;
  }
  if (clue.retiredAt || clue.blockedAt) {
    res.status(410).json({ error: "This clue is no longer available for solving." });
    return;
  }

  const userId = getAuth(req).userId!;
  if (userId === clue.setterUserId) {
    res.status(403).json({ error: "Setters cannot compete on their own clue." });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [progress] = await tx
      .select()
      .from(solverProgressTable)
      .where(getSolverProgressScope(clue.id, userId))
      .for("update")
      .limit(1);
    if (!isActiveSolve(progress)) {
      return { status: 409 as const, error: "Start an active solve before revealing a hint." };
    }
    const hint = getNextClueHint(clue.hints, progress.hintsRevealed);
    if (hint === null) {
      return { status: 409 as const, error: "No hints remain for this clue." };
    }
    const hintsRevealed = progress.hintsRevealed + 1;
    await tx
      .update(solverProgressTable)
      .set({ hintsRevealed })
      .where(eq(solverProgressTable.id, progress.id));
    return { status: 200 as const, hint, hintsRevealed };
  });

  if (result.status === 409) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json(RevealClueHintResponse.parse(result));
});

router.post("/clues/:slug/report", requireAuth, async (req, res): Promise<void> => {
  const params = ReportClueParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = getAuth(req).userId!;
  const result = await db.transaction(async (tx) => {
    const [clue] = await tx
      .select({
        id: cluesTable.id,
        setterUserId: cluesTable.setterUserId,
        retiredAt: cluesTable.retiredAt,
        blockedAt: cluesTable.blockedAt,
      })
      .from(cluesTable)
      .where(eq(cluesTable.slug, params.data.slug))
      .for("update")
      .limit(1);
    if (!clue) {
      return { status: 404 as const, error: "Clue not found." };
    }
    if (clue.retiredAt) {
      return { status: 410 as const, error: "This clue has been retired by its setter." };
    }
    if (clue.blockedAt) {
      return { status: 410 as const, error: "This clue has already been blocked." };
    }
    if (clue.setterUserId === userId) {
      return { status: 403 as const, error: "Setters cannot report their own clues." };
    }

    const [inserted] = await tx
      .insert(clueReportsTable)
      .values({ clueId: clue.id, userId })
      .onConflictDoNothing({
        target: [clueReportsTable.clueId, clueReportsTable.userId],
      })
      .returning({ id: clueReportsTable.id });
    const [summary] = await tx
      .select({ reportCount: count() })
      .from(clueReportsTable)
      .where(eq(clueReportsTable.clueId, clue.id));
    const reportCount = Number(summary?.reportCount ?? 0);
    const blocked = reportCount >= CLUE_REPORT_BLOCK_THRESHOLD;
    if (blocked) {
      await tx
        .update(cluesTable)
        .set({ blockedAt: new Date() })
        .where(and(eq(cluesTable.id, clue.id), isNull(cluesTable.blockedAt)));
    }
    return {
      status: 200 as const,
      reportCount,
      threshold: CLUE_REPORT_BLOCK_THRESHOLD,
      blocked,
      alreadyReported: !inserted,
    };
  });
  if (result.status !== 200) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json(ReportClueResponse.parse(result));
});

router.post("/clues/:slug/appeal", requireAuth, async (req, res): Promise<void> => {
  const params = SubmitClueAppealParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = SubmitClueAppealBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const userId = getAuth(req).userId!;
  const result = await db.transaction(async (tx) => {
    const [clue] = await tx
      .select({
        id: cluesTable.id,
        setterUserId: cluesTable.setterUserId,
        blockedAt: cluesTable.blockedAt,
        retiredAt: cluesTable.retiredAt,
      })
      .from(cluesTable)
      .where(eq(cluesTable.slug, params.data.slug))
      .for("update")
      .limit(1);
    if (!clue) return { status: 404 as const, error: "Clue not found." };
    if (clue.setterUserId !== userId) {
      return { status: 403 as const, error: "Only the original setter can appeal this clue." };
    }
    if (!clue.blockedAt || clue.retiredAt) {
      return { status: 409 as const, error: "Only a blocked, active clue can be appealed." };
    }

    const [existingPending] = await tx
      .select({ id: clueAppealsTable.id })
      .from(clueAppealsTable)
      .where(and(eq(clueAppealsTable.clueId, clue.id), eq(clueAppealsTable.status, "pending")))
      .limit(1);
    if (existingPending) {
      return { status: 409 as const, error: "This clue already has a pending appeal." };
    }
    const [appeal] = await tx
      .insert(clueAppealsTable)
      .values({
        clueId: clue.id,
        setterUserId: userId,
        reason: body.data.reason.trim(),
      })
      .returning();
    const [summary] = await tx
      .select({ reportCount: count() })
      .from(clueReportsTable)
      .where(eq(clueReportsTable.clueId, clue.id));
    return {
      status: 201 as const,
      appeal: {
        id: appeal.id,
        status: "pending" as const,
        reportCount: Number(summary?.reportCount ?? 0),
        submittedAt: appeal.submittedAt,
      },
    };
  });
  if (result.status !== 201) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(201).json(SubmitClueAppealResponse.parse(result.appeal));
});

router.get("/review/appeals", async (req, res): Promise<void> => {
  if (!requireReviewer(req, res)) return;
  const appeals = await db
    .select({
      id: clueAppealsTable.id,
      clueId: clueAppealsTable.clueId,
      slug: cluesTable.slug,
      clue: cluesTable.clue,
      answer: cluesTable.answer,
      wordplay: cluesTable.wordplay,
      setterName: cluesTable.setterName,
      reason: clueAppealsTable.reason,
      submittedAt: clueAppealsTable.submittedAt,
    })
    .from(clueAppealsTable)
    .innerJoin(cluesTable, eq(clueAppealsTable.clueId, cluesTable.id))
    .where(eq(clueAppealsTable.status, "pending"))
    .orderBy(asc(clueAppealsTable.submittedAt));
  const clueIds = [...new Set(appeals.map((appeal) => appeal.clueId))];
  const reportRows = clueIds.length
    ? await db
        .select({ clueId: clueReportsTable.clueId, reportCount: count() })
        .from(clueReportsTable)
        .where(inArray(clueReportsTable.clueId, clueIds))
        .groupBy(clueReportsTable.clueId)
    : [];
  const reportCounts = new Map(reportRows.map((row) => [row.clueId, Number(row.reportCount)]));
  const response = appeals.map((appeal) => ({
    id: appeal.id,
    slug: appeal.slug,
    clue: appeal.clue,
    answer: appeal.answer,
    wordplay: appeal.wordplay,
    setterName: appeal.setterName,
    reason: appeal.reason,
    reportCount: reportCounts.get(appeal.clueId) ?? 0,
    submittedAt: appeal.submittedAt,
  }));
  res.json(ListPendingClueAppealsResponse.parse(response));
});

router.post("/review/appeals/:appealId/decision", async (req, res): Promise<void> => {
  const reviewerUserId = requireReviewer(req, res);
  if (!reviewerUserId) return;
  const params = ReviewClueAppealParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = ReviewClueAppealBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const [appeal] = await tx
      .select()
      .from(clueAppealsTable)
      .where(eq(clueAppealsTable.id, params.data.appealId))
      .for("update")
      .limit(1);
    if (!appeal) return { status: 404 as const, error: "Appeal not found." };
    if (appeal.status !== "pending") {
      return { status: 409 as const, error: "This appeal has already been reviewed." };
    }
    const [clue] = await tx
      .select()
      .from(cluesTable)
      .where(eq(cluesTable.id, appeal.clueId))
      .for("update")
      .limit(1);
    if (!clue || !clue.blockedAt || clue.retiredAt) {
      return { status: 409 as const, error: "This clue is no longer available for review." };
    }
    const reviewedAt = new Date();
    if (body.data.action === "restore") {
      await tx
        .update(cluesTable)
        .set({ blockedAt: null })
        .where(eq(cluesTable.id, clue.id));
    } else {
      await tx
        .update(cluesTable)
        .set({ retiredAt: reviewedAt })
        .where(eq(cluesTable.id, clue.id));
    }
    const status = body.data.action === "restore" ? "restored" as const : "retired" as const;
    await tx
      .update(clueAppealsTable)
      .set({
        status,
        reviewerUserId,
        reviewerAction: body.data.action,
        reviewedAt,
      })
      .where(eq(clueAppealsTable.id, appeal.id));
    return {
      status: 200 as const,
      decision: { id: appeal.id, status, slug: clue.slug, reviewedAt },
    };
  });
  if (result.status !== 200) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json(ReviewClueAppealResponse.parse(result.decision));
});

router.put("/clues/:slug/rating", requireAuth, async (req, res): Promise<void> => {
  const params = RateClueParams.safeParse(req.params);
  const parsed = RateClueBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Choose a rating from 1 to 5 stars." });
    return;
  }
  const userId = getAuth(req).userId!;
  const [clue] = await db
    .select({
      id: cluesTable.id,
      setterUserId: cluesTable.setterUserId,
      retiredAt: cluesTable.retiredAt,
      blockedAt: cluesTable.blockedAt,
    })
    .from(cluesTable)
    .where(eq(cluesTable.slug, params.data.slug))
    .limit(1);
  if (!clue) {
    res.status(404).json({ error: "Clue not found." });
    return;
  }
  if (clue.retiredAt || clue.blockedAt) {
    res.status(410).json({
      error: clue.blockedAt
        ? "This clue has been blocked after reaching 100 community reports."
        : "This clue has been retired by its setter.",
    });
    return;
  }
  if (clue.setterUserId === userId) {
    res.status(403).json({ error: "Setters cannot rate their own clues." });
    return;
  }
  const [solve] = await db
    .select({ solvedAt: solverProgressTable.solvedAt })
    .from(solverProgressTable)
    .where(
      and(
        eq(solverProgressTable.clueId, clue.id),
        eq(solverProgressTable.userId, userId),
        isNotNull(solverProgressTable.solvedAt),
      ),
    )
    .limit(1);
  if (!hasSuccessfulSolve(solve)) {
    res.status(403).json({ error: "Solve this clue before rating it." });
    return;
  }
  await db
    .insert(clueRatingsTable)
    .values({
      clueId: clue.id,
      userId,
      rating: parsed.data.rating,
    })
    .onConflictDoUpdate({
      target: [clueRatingsTable.clueId, clueRatingsTable.userId],
      set: { rating: parsed.data.rating, updatedAt: new Date() },
    });

  const [stats] = await db
    .select({
      averageRating: avg(clueRatingsTable.rating),
      ratingCount: count(),
    })
    .from(clueRatingsTable)
    .where(eq(clueRatingsTable.clueId, clue.id));
  res.json(
    RateClueResponse.parse({
      averageRating: stats?.averageRating == null ? null : Number(stats.averageRating),
      ratingCount: Number(stats?.ratingCount ?? 0),
      userRating: parsed.data.rating,
    }),
  );
});

router.get("/clues/:slug/leaderboard", async (req, res): Promise<void> => {
  const params = GetClueLeaderboardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [clue] = await db
    .select({
      id: cluesTable.id,
      retiredAt: cluesTable.retiredAt,
      blockedAt: cluesTable.blockedAt,
    })
    .from(cluesTable)
    .where(eq(cluesTable.slug, params.data.slug))
    .limit(1);
  if (!clue) {
    res.status(404).json({ error: "Clue not found." });
    return;
  }
  if (clue.retiredAt) {
    res.status(410).json({ error: "This clue has been retired by its setter." });
    return;
  }
  if (clue.blockedAt) {
    res.status(410).json({
      error: "This clue has been blocked after reaching 100 community reports.",
    });
    return;
  }
  const selectLeaderboardRows = (hasHints: boolean) =>
    db
      .select({
        userId: solverProgressTable.userId,
        elapsedSeconds: solverProgressTable.elapsedSeconds,
        attemptsUsed: solverProgressTable.attemptsUsed,
        hintsRevealed: solverProgressTable.hintsRevealed,
        solvedAt: solverProgressTable.solvedAt,
        failedAt: solverProgressTable.failedAt,
      })
      .from(solverProgressTable)
      .where(
        and(
          eq(solverProgressTable.clueId, clue.id),
          isNotNull(solverProgressTable.solvedAt),
          isNull(solverProgressTable.failedAt),
          hasHints
            ? gt(solverProgressTable.hintsRevealed, 0)
            : eq(solverProgressTable.hintsRevealed, 0),
        ),
      )
      .orderBy(
        asc(solverProgressTable.elapsedSeconds),
        asc(solverProgressTable.attemptsUsed),
        asc(solverProgressTable.solvedAt),
      )
      .limit(50);
  const [noHintRows, hintRows] = await Promise.all([
    selectLeaderboardRows(false),
    selectLeaderboardRows(true),
  ]);
  const rows = [...noHintRows, ...hintRows];
  const publicIds = await publicIdsForUsers(rows.map((row) => row.userId));
  const entries = buildClueLeaderboardEntries(rows, publicIds);
  res.json(GetClueLeaderboardResponse.parse(entries));
});

router.post(
  "/clues/:slug/start",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = StartClueParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [clue] = await db
      .select()
      .from(cluesTable)
      .where(eq(cluesTable.slug, params.data.slug))
      .limit(1);
    if (!clue) {
      res.status(404).json({ error: "Clue not found." });
      return;
    }
    if (clue.retiredAt) {
      res.status(410).json({ error: "This clue has been retired by its setter." });
      return;
    }
    if (clue.blockedAt) {
      res.status(410).json({
        error: "This clue has been blocked after reaching 100 community reports.",
      });
      return;
    }
    const userId = getAuth(req).userId!;
    const profile = await ensureProfile(userId);
    if (!profile.onboardingComplete) {
      res.status(409).json({ error: "Choose a public ID before solving a clue." });
      return;
    }
    if (userId === clue.setterUserId) {
      res.status(403).json({ error: "Setters cannot compete on their own clue." });
      return;
    }
    await db
      .insert(solverProgressTable)
      .values({
        clueId: clue.id,
        userId,
        displayName: profile.publicId,
      })
      .onConflictDoNothing({
        target: [solverProgressTable.clueId, solverProgressTable.userId],
      });
    const [progress] = await db
      .select()
      .from(solverProgressTable)
      .where(getSolverProgressScope(clue.id, userId))
      .limit(1);
    const completed = Boolean(progress.solvedAt || progress.failedAt);
    const elapsedSeconds = completed
      ? (progress.elapsedSeconds ?? 0)
      : getSolveElapsedSeconds(progress.startedAt, progress.hintsRevealed);
    res.json(
      StartClueResponse.parse({
        attemptsUsed: progress.attemptsUsed,
        attemptsRemaining: Math.max(0, clue.maxAttempts - progress.attemptsUsed),
        completed,
        elapsedSeconds,
        startedAt: progress.startedAt,
      }),
    );
  },
);

router.post(
  "/clues/:slug/attempts",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = SubmitAttemptParams.safeParse(req.params);
    const parsed = SubmitAttemptBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [clue] = await db
      .select()
      .from(cluesTable)
      .where(eq(cluesTable.slug, params.data.slug))
      .limit(1);
    if (!clue) {
      res.status(404).json({ error: "Clue not found." });
      return;
    }
    if (clue.retiredAt) {
      res.status(410).json({ error: "This clue has been retired by its setter." });
      return;
    }
    if (clue.blockedAt) {
      res.status(410).json({
        error: "This clue has been blocked after reaching 100 community reports.",
      });
      return;
    }

    const userId = getAuth(req).userId!;
    if (userId === clue.setterUserId) {
      res.status(403).json({ error: "Setters cannot compete on their own clue." });
      return;
    }
    const profile = await ensureProfile(userId);
    if (!profile.onboardingComplete) {
      res.status(409).json({ error: "Choose a public ID before solving a clue." });
      return;
    }
    const now = new Date();
    const result = await db.transaction(async (tx) => {
      await tx
        .insert(solverProgressTable)
        .values({
          clueId: clue.id,
          userId,
          displayName: profile.publicId,
        })
        .onConflictDoNothing({
          target: [solverProgressTable.clueId, solverProgressTable.userId],
        });

      const [progress] = await tx
        .select()
        .from(solverProgressTable)
        .where(
          and(
            eq(solverProgressTable.clueId, clue.id),
            eq(solverProgressTable.userId, userId),
          ),
        )
        .for("update")
        .limit(1);
      const terminal = Boolean(progress.solvedAt || progress.failedAt);
      if (terminal) {
        return getCompletedAttemptResult(
          progress,
          clue.maxAttempts,
          progress.elapsedSeconds ?? 0,
        );
      }

      const attemptsUsed = progress.attemptsUsed + 1;
      const correct = normalizeAnswer(parsed.data.answer) === clue.normalizedAnswer;
      const completed = correct || attemptsUsed >= clue.maxAttempts;
      const elapsedSeconds = getSolveElapsedSeconds(
        progress.startedAt,
        progress.hintsRevealed,
        now.getTime(),
      );
      await tx
        .update(solverProgressTable)
        .set({
          attemptsUsed,
          displayName: profile.publicId,
          solvedAt: correct ? now : null,
          failedAt: !correct && completed ? now : null,
          elapsedSeconds: completed ? elapsedSeconds : null,
        })
        .where(eq(solverProgressTable.id, progress.id));

      return {
        correct,
        attemptsUsed,
        attemptsRemaining: Math.max(0, clue.maxAttempts - attemptsUsed),
        completed,
        elapsedSeconds,
        message: correct
          ? "Correct. You cracked the clue."
          : completed
            ? "That was the final attempt. The solution is now revealed."
            : "Not quite. Try another answer.",
      };
    });

    res.json(SubmitAttemptResponse.parse(result));
  },
);

router.post(
  "/clues/:slug/give-up",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = SubmitAttemptParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [clue] = await db
      .select()
      .from(cluesTable)
      .where(eq(cluesTable.slug, params.data.slug))
      .limit(1);
    if (!clue) {
      res.status(404).json({ error: "Clue not found." });
      return;
    }
    if (clue.retiredAt) {
      res.status(410).json({ error: "This clue has been retired by its setter." });
      return;
    }
    if (clue.blockedAt) {
      res.status(410).json({
        error: "This clue has been blocked after reaching 100 community reports.",
      });
      return;
    }

    const userId = getAuth(req).userId!;
    if (userId === clue.setterUserId) {
      res.status(403).json({ error: "Setters cannot compete on their own clue." });
      return;
    }
    const profile = await ensureProfile(userId);
    if (!profile.onboardingComplete) {
      res.status(409).json({ error: "Choose a public ID before giving up on a clue." });
      return;
    }

    const now = new Date();
    const result = await db.transaction(async (tx) => {
      const [progress] = await tx
        .select()
        .from(solverProgressTable)
        .where(
          and(
            eq(solverProgressTable.clueId, clue.id),
            eq(solverProgressTable.userId, userId),
          ),
        )
        .for("update")
        .limit(1);

      if (!progress) {
        return {
          status: 409 as const,
          error: "Start the clue before giving up.",
        };
      }

      const elapsedSeconds =
        progress.elapsedSeconds ??
        getSolveElapsedSeconds(
          progress.startedAt,
          progress.hintsRevealed,
          now.getTime(),
        );
      if (progress.solvedAt || progress.failedAt) {
        return {
          status: 200 as const,
          result: getCompletedAttemptResult(
            progress,
            clue.maxAttempts,
            elapsedSeconds,
          ),
        };
      }

      await tx
        .update(solverProgressTable)
        .set({
          failedAt: now,
          elapsedSeconds,
          displayName: profile.publicId,
        })
        .where(eq(solverProgressTable.id, progress.id));

      return {
        status: 200 as const,
        result: {
          correct: false,
          attemptsUsed: progress.attemptsUsed,
          attemptsRemaining: 0,
          completed: true,
          elapsedSeconds,
          message: "You gave up. The answer and wordplay are revealed.",
        },
      };
    });

    if (result.status === 409) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    res.json(SubmitAttemptResponse.parse(result.result));
  },
);

router.get("/leaderboards/solvers", async (_req, res): Promise<void> => {
  const averageTime = avg(solverProgressTable.elapsedSeconds);
  const rows = await db
    .select({
      userId: solverProgressTable.userId,
      averageSeconds: averageTime,
      solvedCount: count(),
    })
    .from(solverProgressTable)
    .where(
      and(
        isNotNull(solverProgressTable.solvedAt),
        isNotNull(solverProgressTable.elapsedSeconds),
      ),
    )
    .groupBy(solverProgressTable.userId)
    .orderBy(asc(averageTime), desc(count()))
    .limit(20);
  const publicIds = await publicIdsForUsers(rows.map((row) => row.userId));
  res.json(
    GetSolverLeaderboardResponse.parse(
      rows.map((row, index) => ({
      rank: index + 1,
      displayName: publicIds.get(row.userId) ?? "Guest solver",
      averageSeconds: Number(Number(row.averageSeconds ?? 0).toFixed(1)),
      solvedCount: Number(row.solvedCount),
      })),
    ),
  );
});

router.get("/leaderboards/setters", async (_req, res): Promise<void> => {
  const averageRating = avg(clueRatingsTable.rating);
  const rows = await db
    .select({
      userId: userProfilesTable.userId,
      displayName: userProfilesTable.publicId,
      averageRating,
      ratingCount: count(),
    })
    .from(clueRatingsTable)
    .innerJoin(cluesTable, eq(clueRatingsTable.clueId, cluesTable.id))
    .innerJoin(userProfilesTable, eq(cluesTable.setterUserId, userProfilesTable.userId))
    .groupBy(userProfilesTable.userId, userProfilesTable.publicId)
    .orderBy(desc(averageRating), desc(count()))
    .limit(20);
  res.json(
    GetSetterLeaderboardResponse.parse(
      rows.map((row, index) => ({
      rank: index + 1,
      displayName: row.displayName,
      averageRating: Number(Number(row.averageRating ?? 0).toFixed(2)),
      ratingCount: Number(row.ratingCount),
      })),
    ),
  );
});

router.get("/me/profile", requireAuth, async (req, res): Promise<void> => {
  const profile = await ensureProfile(getAuth(req).userId!);
  res.json(GetMyProfileResponse.parse(await publicProfileResponse(profile)));
});

router.delete("/me/account", requireAuth, async (req, res): Promise<void> => {
  const parsed = DeleteMyAccountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = getAuth(req).userId!;
  const profile = await ensureProfile(userId);
  const normalizedConfirmation = parsed.data.confirmationPublicId.trim().toLowerCase();
  if (normalizedConfirmation !== profile.normalizedPublicId) {
    res.status(400).json({ error: "Enter your current public ID exactly to confirm deletion." });
    return;
  }

  let clerkAccountDeleted = false;
  try {
    await db.transaction(async (tx) => {
      // Retain the profile and ID reservation as the public owner of preserved history.
      const [updated] = await tx
        .update(userProfilesTable)
        .set({ blurb: null, updatedAt: new Date() })
        .where(
          and(
            eq(userProfilesTable.userId, userId),
            eq(userProfilesTable.normalizedPublicId, normalizedConfirmation),
          ),
        )
        .returning({ id: userProfilesTable.id });
      if (!updated) throw new AccountDeletionConfirmationError();

      await clerkClient.users.deleteUser(userId);
      clerkAccountDeleted = true;
    });
  } catch (error) {
    if (error instanceof AccountDeletionConfirmationError) {
      res.status(400).json({ error: "Your public ID changed. Refresh and try again." });
      return;
    }

    if (!clerkAccountDeleted) {
      req.log.error({ err: error }, "Account deletion failed before the sign-in was removed.");
      res.status(502).json({
        error: "We couldn't delete your sign-in. Your profile, ID reservation, and public history are unchanged. Please try again.",
      });
      return;
    }

    try {
      await db
        .update(userProfilesTable)
        .set({ blurb: null, updatedAt: new Date() })
        .where(eq(userProfilesTable.userId, userId));
    } catch (cleanupError) {
      req.log.error(
        { err: error, cleanupError },
        "The sign-in was deleted, but the public profile blurb could not be cleared.",
      );
      res.status(500).json({
        error: "Your sign-in was deleted, but your public blurb could not be cleared. Please contact support.",
      });
      return;
    }

    req.log.warn({ err: error }, "Account deletion cleanup succeeded after a database transaction error.");
  }

  res.sendStatus(204);
});

router.patch("/me/profile", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateMyProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const userId = getAuth(req).userId!;
  const existing = await ensureProfile(userId);
  const requestedId = parsed.data.publicId?.trim();
  const normalizedRequestedId = requestedId?.toLowerCase();
  const [priorReservation] = normalizedRequestedId
    ? await db
        .select({ userId: userPublicIdReservationsTable.userId })
        .from(userPublicIdReservationsTable)
        .where(eq(userPublicIdReservationsTable.normalizedPublicId, normalizedRequestedId))
        .limit(1)
    : [];
  const isOwnReservedId =
    normalizedRequestedId === existing.normalizedPublicId ||
    priorReservation?.userId === userId;
  if (
    requestedId &&
    !/^[A-Za-z0-9][A-Za-z0-9_-]{2,23}$/.test(requestedId) &&
    !isOwnReservedId
  ) {
    res.status(400).json({
      error: "Use 3–24 letters, numbers, underscores, or hyphens for your public ID.",
    });
    return;
  }
  const requestedBlurb = parsed.data.blurb;
  if (requestedBlurb !== undefined && containsObjectionableLanguage(requestedBlurb)) {
    res.status(400).json({
      error: "Please remove profanity or hateful language from your public blurb.",
    });
    return;
  }

  const publicId = requestedId || existing.publicId;
  const isGuest = requestedId ? false : existing.isGuest;
  const blurb =
    requestedBlurb === undefined ? existing.blurb : requestedBlurb.trim() || null;
  try {
    const updated = await db.transaction(async (tx) => {
      const currentProfiles = await tx
        .select({
          userId: userProfilesTable.userId,
          normalizedPublicId: userProfilesTable.normalizedPublicId,
          publicId: userProfilesTable.publicId,
        })
        .from(userProfilesTable)
        .orderBy(asc(userProfilesTable.normalizedPublicId));
      if (currentProfiles.length) {
        await tx
          .insert(userPublicIdReservationsTable)
          .values(currentProfiles)
          .onConflictDoNothing();
      }

      const normalizedPublicId = publicId.toLowerCase();
      const [reservation] = await tx
        .insert(userPublicIdReservationsTable)
        .values({ userId, normalizedPublicId, publicId })
        .onConflictDoNothing()
        .returning();
      if (!reservation) {
        const [owner] = await tx
          .select({ userId: userPublicIdReservationsTable.userId })
          .from(userPublicIdReservationsTable)
          .where(eq(userPublicIdReservationsTable.normalizedPublicId, normalizedPublicId))
          .limit(1);
        if (owner?.userId !== userId) throw new PublicIdAlreadyClaimedError();
      }

      const [profile] = await tx
        .update(userProfilesTable)
        .set({
          publicId,
          normalizedPublicId,
          blurb,
          isGuest,
          onboardingComplete: true,
          updatedAt: new Date(),
        })
        .where(eq(userProfilesTable.userId, userId))
        .returning();
      if (!profile) throw new Error("Profile disappeared while being updated.");

      await tx
        .update(cluesTable)
        .set({ setterName: profile.publicId })
        .where(eq(cluesTable.setterUserId, userId));
      await tx
        .update(solverProgressTable)
        .set({ displayName: profile.publicId })
        .where(eq(solverProgressTable.userId, userId));
      return profile;
    });
    res.json(UpdateMyProfileResponse.parse(await publicProfileResponse(updated)));
  } catch (error) {
    if (error instanceof PublicIdAlreadyClaimedError || isUniqueViolation(error)) {
      res.status(409).json({ error: "That public ID is already in use. Try another one." });
      return;
    }
    throw error;
  }
});

router.get("/me/activity", requireAuth, async (req, res): Promise<void> => {
  const params = GetMyActivityQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const userId = getAuth(req).userId!;
  const offset = params.data.offset ?? 0;
  const activityRows = await db
    .select({ clue: cluesTable, progress: solverProgressTable })
    .from(solverProgressTable)
    .innerJoin(cluesTable, eq(solverProgressTable.clueId, cluesTable.id))
    .where(getDashboardActivityScope(userId))
    .orderBy(desc(solverProgressTable.startedAt), desc(solverProgressTable.id))
    .limit(SOLVER_ACTIVITY_PAGE_SIZE + 1)
    .offset(offset);
  const hasMore = activityRows.length > SOLVER_ACTIVITY_PAGE_SIZE;
  const activities = activityRows
    .slice(0, SOLVER_ACTIVITY_PAGE_SIZE)
    .map(({ clue, progress }) => serializeSolverActivity(clue, progress));
  res.json(
    GetMyActivityResponse.parse({
      activities,
      nextOffset: hasMore ? offset + SOLVER_ACTIVITY_PAGE_SIZE : null,
    }),
  );
});

router.get("/me/dashboard", requireAuth, async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const profile = await ensureProfile(userId);
  const [createdRow] = await db
    .select({ total: count() })
    .from(cluesTable)
    .where(eq(cluesTable.setterUserId, userId));
  const [solvedRow] = await db
    .select({ total: count() })
    .from(solverProgressTable)
    .where(
      and(
        eq(solverProgressTable.userId, userId),
        isNotNull(solverProgressTable.solvedAt),
      ),
    );
  const recent = await db
    .select()
    .from(cluesTable)
    .where(and(eq(cluesTable.setterUserId, userId), isNull(cluesTable.retiredAt)))
    .orderBy(desc(cluesTable.createdAt))
    .limit(6);
  const counts = await solveCounts(recent.map((clue) => clue.id));
  const ratings = await clueRatingSummaries(recent.map((clue) => clue.id));
  const recentClues = recent.map((clue) => ({
    id: clue.id,
    slug: clue.slug,
    clue: clue.clue,
    answerLength: normalizeAnswer(clue.answer).length,
    maxAttempts: clue.maxAttempts,
    setterName: profile.publicId,
    setterBlurb: profile.blurb,
    solveCount: counts.get(clue.id) ?? 0,
    averageRating: ratings.get(clue.id)?.averageRating ?? null,
    ratingCount: ratings.get(clue.id)?.ratingCount ?? 0,
    isBlocked: Boolean(clue.blockedAt),
    createdAt: clue.createdAt,
  }));
  const activityRows = await db
    .select({ clue: cluesTable, progress: solverProgressTable })
    .from(solverProgressTable)
    .innerJoin(cluesTable, eq(solverProgressTable.clueId, cluesTable.id))
    .where(getDashboardActivityScope(userId))
    .orderBy(desc(solverProgressTable.startedAt), desc(solverProgressTable.id))
    .limit(SOLVER_ACTIVITY_PAGE_SIZE + 1);
  const hasMoreActivity = activityRows.length > SOLVER_ACTIVITY_PAGE_SIZE;
  const recentActivity = activityRows
    .slice(0, SOLVER_ACTIVITY_PAGE_SIZE)
    .map(({ clue, progress }) => serializeSolverActivity(clue, progress));
  res.json(
    GetMyDashboardResponse.parse({
      created: Number(createdRow.total),
      solved: Number(solvedRow.total),
      recentClues,
      recentActivity,
      hasMoreActivity,
    }),
  );
});

export default router;
