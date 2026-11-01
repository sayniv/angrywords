import { randomBytes, randomInt } from "node:crypto";
import { Router, type IRouter, type RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import {
  AttemptResult,
  CreateClueBody,
  CreateClueResponse,
  GetClueLeaderboardParams,
  GetClueLeaderboardResponse,
  GetClueParams,
  GetClueResponse,
  GetMyDashboardResponse,
  GetMyProfileResponse,
  ListCluesResponse,
  RetireClueParams,
  StartClueParams,
  StartClueResponse,
  SubmitAttemptBody,
  SubmitAttemptParams,
  SubmitAttemptResponse,
  UpdateClueBody,
  UpdateClueParams,
  UpdateClueResponse,
  UpdateMyProfileBody,
  UpdateMyProfileResponse,
} from "@workspace/api-zod";
import { db, cluesTable, solverProgressTable, userProfilesTable } from "@workspace/db";

const router: IRouter = Router();
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

function publicProfileResponse(profile: {
  publicId: string;
  isGuest: boolean;
  onboardingComplete: boolean;
}) {
  return {
    publicId: profile.publicId,
    isGuest: profile.isGuest,
    needsSetup: !profile.onboardingComplete,
  };
}

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
    const [created] = await db
      .insert(userProfilesTable)
      .values({
        userId,
        publicId,
        normalizedPublicId: publicId.toLowerCase(),
        isGuest: true,
      })
      .onConflictDoNothing()
      .returning();
    if (created) {
      await db.transaction(async (tx) => {
        await tx
          .update(cluesTable)
          .set({ setterName: created.publicId })
          .where(eq(cluesTable.setterUserId, userId));
        await tx
          .update(solverProgressTable)
          .set({ displayName: created.publicId })
          .where(eq(solverProgressTable.userId, userId));
      });
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

router.get("/clues", async (_req, res): Promise<void> => {
  const clues = await db
    .select()
    .from(cluesTable)
    .where(isNull(cluesTable.retiredAt))
    .orderBy(desc(cluesTable.createdAt))
    .limit(30);
  const counts = await solveCounts(clues.map((clue) => clue.id));
  const publicIds = await publicIdsForUsers(clues.map((clue) => clue.setterUserId));
  const response = clues.map((clue) => ({
    id: clue.id,
    slug: clue.slug,
    clue: clue.clue,
    answerLength: normalizeAnswer(clue.answer).length,
    maxAttempts: clue.maxAttempts,
    setterName: publicIds.get(clue.setterUserId) ?? "Puzzle setter",
    solveCount: counts.get(clue.id) ?? 0,
    createdAt: clue.createdAt,
  }));
  res.json(ListCluesResponse.parse(response));
});

router.post("/clues", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateClueBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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

  const [clue] = await db
    .insert(cluesTable)
    .values({
      slug: randomBytes(6).toString("hex"),
      clue: parsed.data.clue.trim(),
      answer: parsed.data.answer.trim(),
      normalizedAnswer: answer,
      wordplay: parsed.data.wordplay?.trim() || null,
      maxAttempts: parsed.data.maxAttempts,
      setterUserId: auth.userId!,
      setterName: profile.publicId,
    })
    .returning();

  const response = {
    id: clue.id,
    slug: clue.slug,
    clue: clue.clue,
    answerLength: answer.length,
    wordplay: clue.wordplay,
    maxAttempts: clue.maxAttempts,
    setterName: clue.setterName,
    isOwner: true,
    createdAt: clue.createdAt,
    userAttemptsUsed: null,
    userCompleted: null,
    userElapsedSeconds: null,
    userStartedAt: null,
    userSolved: null,
    revealedAnswer: clue.answer,
  };
  res.status(201).json(CreateClueResponse.parse(response));
});

router.patch("/clues/:slug", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateClueParams.safeParse(req.params);
  const parsed = UpdateClueBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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
    res.status(403).json({ error: "Only the original setter can update this clue." });
    return;
  }
  if (existing.retiredAt) {
    res.status(410).json({ error: "This clue has been retired and can no longer be edited." });
    return;
  }

  const answer = normalizeAnswer(parsed.data.answer);
  if (!answer) {
    res.status(400).json({ error: "The answer must contain at least one letter or number." });
    return;
  }
  const now = new Date();
  const updated = await db.transaction(async (tx) => {
    const [clue] = await tx
      .update(cluesTable)
      .set({
        clue: parsed.data.clue.trim(),
        answer: parsed.data.answer.trim(),
        normalizedAnswer: answer,
        wordplay: parsed.data.wordplay.trim() || null,
        maxAttempts: parsed.data.maxAttempts,
      })
      .where(
        and(
          eq(cluesTable.id, existing.id),
          eq(cluesTable.setterUserId, userId),
          isNull(cluesTable.retiredAt),
        ),
      )
      .returning();
    if (!clue) return null;

    const activeProgress = await tx
      .select()
      .from(solverProgressTable)
      .where(
        and(
          eq(solverProgressTable.clueId, clue.id),
          isNull(solverProgressTable.solvedAt),
          isNull(solverProgressTable.failedAt),
        ),
      );
    for (const progress of activeProgress) {
      if (progress.attemptsUsed >= clue.maxAttempts) {
        await tx
          .update(solverProgressTable)
          .set({
            failedAt: now,
            elapsedSeconds: Math.max(
              0,
              Math.floor((now.getTime() - progress.startedAt.getTime()) / 1000),
            ),
          })
          .where(eq(solverProgressTable.id, progress.id));
      }
    }
    return clue;
  });
  if (!updated) {
    res.status(410).json({ error: "This clue has been retired and can no longer be edited." });
    return;
  }

  res.json(
    UpdateClueResponse.parse({
      id: updated.id,
      slug: updated.slug,
      clue: updated.clue,
      answerLength: answer.length,
      wordplay: updated.wordplay,
      maxAttempts: updated.maxAttempts,
      setterName: updated.setterName,
      isOwner: true,
      createdAt: updated.createdAt,
      userAttemptsUsed: null,
      userCompleted: null,
      userElapsedSeconds: null,
      userStartedAt: null,
      userSolved: null,
      revealedAnswer: updated.answer,
    }),
  );
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
  const setterPublicId =
    userId === clue.setterUserId
      ? (await ensureProfile(clue.setterUserId)).publicId
      : (await publicIdsForUsers([clue.setterUserId])).get(clue.setterUserId) ?? "Puzzle setter";
  const [progress] = userId
    ? await db
        .select()
        .from(solverProgressTable)
        .where(
          and(
            eq(solverProgressTable.clueId, clue.id),
            eq(solverProgressTable.userId, userId),
          ),
        )
        .limit(1)
    : [];

  const currentElapsed =
    progress && !progress.solvedAt && !progress.failedAt
      ? Math.max(0, Math.floor((Date.now() - progress.startedAt.getTime()) / 1000))
      : progress?.elapsedSeconds ?? null;

  const response = {
    id: clue.id,
    slug: clue.slug,
    clue: clue.clue,
    answerLength: normalizeAnswer(clue.answer).length,
    wordplay:
      clue.setterUserId === userId || progress?.solvedAt || progress?.failedAt
        ? clue.wordplay
        : null,
    maxAttempts: clue.maxAttempts,
    setterName: setterPublicId,
    isOwner: clue.setterUserId === userId,
    createdAt: clue.createdAt,
    userAttemptsUsed: progress?.attemptsUsed ?? null,
    userCompleted: progress ? Boolean(progress.solvedAt || progress.failedAt) : null,
    userElapsedSeconds: currentElapsed,
    userStartedAt: progress?.startedAt ?? null,
    userSolved: progress ? Boolean(progress.solvedAt) : null,
    revealedAnswer:
      clue.setterUserId === userId || progress?.solvedAt || progress?.failedAt
        ? clue.answer
        : null,
  };
  res.json(GetClueResponse.parse(response));
});

router.get("/clues/:slug/leaderboard", async (req, res): Promise<void> => {
  const params = GetClueLeaderboardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [clue] = await db
    .select({ id: cluesTable.id, retiredAt: cluesTable.retiredAt })
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
  const rows = await db
    .select({
      userId: solverProgressTable.userId,
      elapsedSeconds: solverProgressTable.elapsedSeconds,
      attemptsUsed: solverProgressTable.attemptsUsed,
      solvedAt: solverProgressTable.solvedAt,
    })
    .from(solverProgressTable)
    .where(
      and(
        eq(solverProgressTable.clueId, clue.id),
        isNotNull(solverProgressTable.solvedAt),
      ),
    )
    .orderBy(
      asc(solverProgressTable.elapsedSeconds),
      asc(solverProgressTable.attemptsUsed),
      asc(solverProgressTable.solvedAt),
    )
    .limit(50);
  const publicIds = await publicIdsForUsers(rows.map((row) => row.userId));
  res.json(
    GetClueLeaderboardResponse.parse(
      rows.map((row, index) => ({
        rank: index + 1,
        displayName: publicIds.get(row.userId) ?? "Guest solver",
        elapsedSeconds: row.elapsedSeconds ?? 0,
        attemptsUsed: row.attemptsUsed,
        solvedAt: row.solvedAt,
      })),
    ),
  );
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
      .where(
        and(
          eq(solverProgressTable.clueId, clue.id),
          eq(solverProgressTable.userId, userId),
        ),
      )
      .limit(1);
    const completed = Boolean(progress.solvedAt || progress.failedAt);
    const elapsedSeconds = completed
      ? (progress.elapsedSeconds ?? 0)
      : Math.max(0, Math.floor((Date.now() - progress.startedAt.getTime()) / 1000));
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
        return {
          correct: Boolean(progress.solvedAt),
          attemptsUsed: progress.attemptsUsed,
          attemptsRemaining: 0,
          completed: true,
          elapsedSeconds: progress.elapsedSeconds ?? 0,
          message: progress.solvedAt
            ? "You already solved this clue."
            : "No attempts remain for this clue.",
        };
      }

      const attemptsUsed = progress.attemptsUsed + 1;
      const correct = normalizeAnswer(parsed.data.answer) === clue.normalizedAnswer;
      const completed = correct || attemptsUsed >= clue.maxAttempts;
      const elapsedSeconds = Math.max(
        0,
        Math.floor((now.getTime() - progress.startedAt.getTime()) / 1000),
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

router.get("/me/profile", requireAuth, async (req, res): Promise<void> => {
  const profile = await ensureProfile(getAuth(req).userId!);
  res.json(GetMyProfileResponse.parse(publicProfileResponse(profile)));
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
  if (requestedId && !/^[A-Za-z0-9][A-Za-z0-9_-]{2,23}$/.test(requestedId)) {
    res.status(400).json({
      error: "Use 3–24 letters, numbers, underscores, or hyphens for your public ID.",
    });
    return;
  }

  const publicId = requestedId || existing.publicId;
  const isGuest = requestedId ? false : existing.isGuest;
  try {
    const updated = await db.transaction(async (tx) => {
      const [profile] = await tx
        .update(userProfilesTable)
        .set({
          publicId,
          normalizedPublicId: publicId.toLowerCase(),
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
    res.json(UpdateMyProfileResponse.parse(publicProfileResponse(updated)));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "That public ID is already in use. Try another one." });
      return;
    }
    throw error;
  }
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
  const recentClues = recent.map((clue) => ({
    id: clue.id,
    slug: clue.slug,
    clue: clue.clue,
    answerLength: normalizeAnswer(clue.answer).length,
    maxAttempts: clue.maxAttempts,
    setterName: profile.publicId,
    solveCount: counts.get(clue.id) ?? 0,
    createdAt: clue.createdAt,
  }));
  res.json(
    GetMyDashboardResponse.parse({
      created: Number(createdRow.total),
      solved: Number(solvedRow.total),
      recentClues,
    }),
  );
});

export default router;
