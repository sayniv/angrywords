export const MAX_CLUE_HINTS = 3;
export const CLUE_HINT_PENALTY_SECONDS = 60;
export const MAX_CLUE_HINT_LENGTH = 300;

export function normalizeClueHints(hints: string[] | undefined): {
  valid: boolean;
  hints: string[];
} {
  const normalized = (hints ?? []).map((hint) => hint.trim());
  return {
    valid:
      normalized.length <= MAX_CLUE_HINTS &&
      normalized.every((hint) => hint.length > 0 && hint.length <= MAX_CLUE_HINT_LENGTH),
    hints: normalized,
  };
}

export function getNextClueHint(hints: string[], hintsRevealed: number) {
  return hints[hintsRevealed] ?? null;
}

export function getPreviouslyRevealedHints(hints: string[], hintsRevealed: number) {
  return hints.slice(0, Math.max(0, Math.min(hintsRevealed, hints.length)));
}

export function isActiveSolve(progress:
  | { solvedAt: Date | null; failedAt: Date | null }
  | undefined,
) {
  return Boolean(progress && !progress.solvedAt && !progress.failedAt);
}

export function getSolveElapsedSeconds(
  startedAt: Date,
  hintsRevealed: number,
  now = Date.now(),
) {
  const elapsedBeforePenalties = Math.max(
    0,
    Math.floor((now - startedAt.getTime()) / 1000),
  );
  return elapsedBeforePenalties + hintsRevealed * CLUE_HINT_PENALTY_SECONDS;
}
