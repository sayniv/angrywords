type SolverProgress = {
  solvedAt: Date | null;
  failedAt: Date | null;
  attemptsUsed: number;
  elapsedSeconds: number | null;
};

export function getClueProgressState(
  progress: SolverProgress | undefined,
  isOwner: boolean,
) {
  return {
    userCompleted: progress
      ? Boolean(progress.solvedAt || progress.failedAt)
      : null,
    userSolved: progress ? Boolean(progress.solvedAt) : null,
    revealSolution:
      isOwner || Boolean(progress?.solvedAt || progress?.failedAt),
  };
}

export function getCompletedAttemptResult(
  progress: SolverProgress,
  maxAttempts: number,
  elapsedSeconds: number,
) {
  const gaveUp = Boolean(progress.failedAt && progress.attemptsUsed < maxAttempts);

  return {
    correct: Boolean(progress.solvedAt),
    attemptsUsed: progress.attemptsUsed,
    attemptsRemaining: 0,
    completed: true,
    elapsedSeconds,
    message: progress.solvedAt
      ? "You already solved this clue."
      : gaveUp
        ? "You gave up. The answer and wordplay are revealed."
        : "No attempts remain for this clue.",
  };
}

export function hasSuccessfulSolve(
  progress: Pick<SolverProgress, "solvedAt"> | undefined,
) {
  return Boolean(progress?.solvedAt);
}
