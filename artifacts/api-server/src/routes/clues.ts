import { randomBytes } from "node:crypto";
import { Router, type IRouter, type RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { and, asc, count, desc, eq, inArray, isNotNull } from "drizzle-orm";
import {
  AttemptResult,
  CreateClueBody,
  CreateClueResponse,
  GetClueLeaderboardParams,
  GetClueLeaderboardResponse,
  GetClueParams,
  GetClueResponse,
  GetMyDashboardResponse,
  ListCluesResponse,
  StartClueParams,
  StartClueResponse,
  SubmitAttemptBody,
  SubmitAttemptParams,
  SubmitAttemptResponse,
} from "@workspace/api-zod";
import { db, cluesTable, solverProgressTable } from "@workspace/db";

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

function displayName(value: string | undefined, fallback: string): string {
  const clean = value?.trim().replace(/\s+/g, " ").slice(0, 48);
  return clean || fallback;
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
    .orderBy(desc(cluesTable.createdAt))
    .limit(30);
  const counts = await solveCounts(clues.map((clue) => clue.id));
  const response = clues.map((clue) => ({
    id: clue.id,
    slug: clue.slug,
    clue: clue.clue,
    answerLength: normalizeAnswer(clue.answer).length,
    maxAttempts: clue.maxAttempts,
    setterName: clue.setterName,
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
      setterName: displayName(parsed.data.displayName, "Anonymous Setter"),
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

  const userId = getAuth(req).userId;
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
    setterName: clue.setterName,
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
    .select({ id: cluesTable.id })
    .from(cluesTable)
    .where(eq(cluesTable.slug, params.data.slug))
    .limit(1);
  if (!clue) {
    res.status(404).json({ error: "Clue not found." });
    return;
  }
  const rows = await db
    .select({
      displayName: solverProgressTable.displayName,
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
  res.json(
    GetClueLeaderboardResponse.parse(
      rows.map((row, index) => ({
        rank: index + 1,
        displayName: row.displayName,
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
    const userId = getAuth(req).userId!;
    if (userId === clue.setterUserId) {
      res.status(403).json({ error: "Setters cannot compete on their own clue." });
      return;
    }
    await db
      .insert(solverProgressTable)
      .values({
        clueId: clue.id,
        userId,
        displayName: "Solver",
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

    const userId = getAuth(req).userId!;
    if (userId === clue.setterUserId) {
      res.status(403).json({ error: "Setters cannot compete on their own clue." });
      return;
    }
    const now = new Date();
    const result = await db.transaction(async (tx) => {
      await tx
        .insert(solverProgressTable)
        .values({
          clueId: clue.id,
          userId,
          displayName: displayName(parsed.data.displayName, "Solver"),
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
          displayName: displayName(parsed.data.displayName, progress.displayName),
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

router.get("/me/dashboard", requireAuth, async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
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
    .where(eq(cluesTable.setterUserId, userId))
    .orderBy(desc(cluesTable.createdAt))
    .limit(6);
  const counts = await solveCounts(recent.map((clue) => clue.id));
  const recentClues = recent.map((clue) => ({
    id: clue.id,
    slug: clue.slug,
    clue: clue.clue,
    answerLength: normalizeAnswer(clue.answer).length,
    maxAttempts: clue.maxAttempts,
    setterName: clue.setterName,
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
