export interface ClueLeaderboardRow {
  userId: string;
  elapsedSeconds: number | null;
  attemptsUsed: number;
  hintsRevealed: number;
  solvedAt: Date | null;
  failedAt: Date | null;
}

interface ClueLeaderboardEntry {
  rank: number;
  displayName: string;
  elapsedSeconds: number;
  attemptsUsed: number;
  solvedAt: Date;
}

export interface ClueLeaderboardEntries {
  noHints: ClueLeaderboardEntry[];
  hintsUsed: ClueLeaderboardEntry[];
}

function compareSolves(left: ClueLeaderboardRow, right: ClueLeaderboardRow): number {
  if (left.elapsedSeconds === null && right.elapsedSeconds !== null) return 1;
  if (left.elapsedSeconds !== null && right.elapsedSeconds === null) return -1;
  if (left.elapsedSeconds !== right.elapsedSeconds) {
    return (left.elapsedSeconds ?? 0) - (right.elapsedSeconds ?? 0);
  }
  if (left.attemptsUsed !== right.attemptsUsed) {
    return left.attemptsUsed - right.attemptsUsed;
  }
  return (left.solvedAt?.getTime() ?? 0) - (right.solvedAt?.getTime() ?? 0);
}

export function buildClueLeaderboardEntries(
  rows: ClueLeaderboardRow[],
  publicIds: Map<string, string>,
): ClueLeaderboardEntries {
  const eligible = rows.filter((row) => row.solvedAt !== null && row.failedAt === null);
  const buildCategory = (hasHints: boolean): ClueLeaderboardEntry[] =>
    eligible
      .filter((row) => (row.hintsRevealed > 0) === hasHints)
      .sort(compareSolves)
      .slice(0, 50)
      .map((row, index) => ({
        rank: index + 1,
        displayName: publicIds.get(row.userId) ?? "Guest solver",
        elapsedSeconds: row.elapsedSeconds ?? 0,
        attemptsUsed: row.attemptsUsed,
        solvedAt: row.solvedAt!,
      }));

  return {
    noHints: buildCategory(false),
    hintsUsed: buildCategory(true),
  };
}
