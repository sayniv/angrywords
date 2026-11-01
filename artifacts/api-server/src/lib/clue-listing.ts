import { and, desc, isNull, sql, type SQL, type SQLWrapper } from "drizzle-orm";

export function getPlayableClueFilter(retiredAt: SQLWrapper, blockedAt: SQLWrapper) {
  return and(isNull(retiredAt), isNull(blockedAt));
}

export function getClueListingOrder(
  sortByRating: boolean,
  fields: {
    averageRating: SQLWrapper;
    ratingCount: SQLWrapper;
    createdAt: SQLWrapper;
    id: SQLWrapper;
  },
): SQL[] {
  if (sortByRating) {
    return [
      sql`${fields.averageRating} DESC NULLS LAST`,
      desc(fields.ratingCount),
      desc(fields.createdAt),
      desc(fields.id),
    ];
  }
  return [desc(fields.createdAt), desc(fields.id)];
}

export function serializePublicClueSummary(
  clue: {
    id: number;
    slug: string;
    clue: string;
    answer: string;
    maxAttempts: number;
    setterName: string;
    blockedAt: Date | null;
    createdAt: Date;
    averageRating: string | number | null;
    ratingCount: string | number | null;
  },
  solveCount: number,
  setterProfile?: { publicId: string; blurb: string | null },
) {
  return {
    id: clue.id,
    slug: clue.slug,
    clue: clue.clue,
    answerLength: clue.answer.toLocaleUpperCase("en").replace(/[^A-Z0-9]/g, "").length,
    maxAttempts: clue.maxAttempts,
    setterName: setterProfile?.publicId ?? clue.setterName,
    setterBlurb: setterProfile?.blurb ?? null,
    solveCount,
    averageRating: clue.averageRating == null ? null : Number(clue.averageRating),
    ratingCount: Number(clue.ratingCount ?? 0),
    isBlocked: Boolean(clue.blockedAt),
    createdAt: clue.createdAt,
  };
}
