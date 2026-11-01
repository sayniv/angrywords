export type SavedClueProgress = {
  userCompleted: boolean | null;
  userAttemptsUsed: number | null;
  userElapsedSeconds: number | null;
  userSolved: boolean | null;
  maxAttempts: number;
};

export function getSavedAttemptResult(clue: SavedClueProgress | undefined) {
  if (
    !clue ||
    (!clue.userCompleted &&
      (clue.userAttemptsUsed === null || clue.userAttemptsUsed === 0))
  ) {
    return null;
  }

  const userSolved = Boolean(clue.userSolved);
  return {
    correct: userSolved,
    attemptsUsed: clue.userAttemptsUsed ?? 0,
    attemptsRemaining: clue.userCompleted
      ? 0
      : Math.max(0, clue.maxAttempts - (clue.userAttemptsUsed ?? 0)),
    completed: Boolean(clue.userCompleted),
    elapsedSeconds: clue.userElapsedSeconds ?? 0,
    message: clue.userCompleted
      ? userSolved
        ? "You already solved this clue."
        : (clue.userAttemptsUsed ?? 0) < clue.maxAttempts
          ? "You gave up. The answer and wordplay are revealed."
          : "No attempts remain for this clue."
      : "Your progress is saved. Keep going.",
  };
}
