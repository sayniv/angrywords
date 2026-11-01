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

export type ClueListingSort = "newest" | "rating";

export type ClueListingCursor = {
  sort: ClueListingSort;
  createdAt: string;
  id: number;
  averageRating: string | null;
  ratingCount: number;
};

export function encodeClueListingCursor(cursor: ClueListingCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeClueListingCursor(value: string): ClueListingCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const cursor = parsed as Partial<ClueListingCursor>;
    if (
      (cursor.sort !== "newest" && cursor.sort !== "rating")
      || typeof cursor.createdAt !== "string"
      || !Number.isFinite(Date.parse(cursor.createdAt))
      || !Number.isInteger(cursor.id)
      || (cursor.id ?? 0) < 1
      || !Number.isInteger(cursor.ratingCount)
      || (cursor.ratingCount ?? -1) < 0
      || (cursor.averageRating !== null
        && (typeof cursor.averageRating !== "string" || !Number.isFinite(Number(cursor.averageRating))))
    ) {
      return null;
    }
    return cursor as ClueListingCursor;
  } catch {
    return null;
  }
}

export function getClueListingCursorCondition(
  cursor: ClueListingCursor,
  fields: {
    averageRating: SQLWrapper;
    ratingCount: SQLWrapper;
    createdAt: SQLWrapper;
    id: SQLWrapper;
  },
): SQL {
  const earlierClue = sql`(${fields.createdAt} < ${cursor.createdAt} OR (${fields.createdAt} = ${cursor.createdAt} AND ${fields.id} < ${cursor.id}))`;
  if (cursor.sort === "newest") return earlierClue;

  const sameRatingEarlier = sql`(${fields.ratingCount} < ${cursor.ratingCount} OR (${fields.ratingCount} = ${cursor.ratingCount} AND ${earlierClue}))`;
  if (cursor.averageRating === null) {
    return sql`${fields.averageRating} IS NULL AND ${sameRatingEarlier}`;
  }
  return sql`(${fields.averageRating} IS NULL OR ${fields.averageRating} < ${cursor.averageRating} OR (${fields.averageRating} = ${cursor.averageRating} AND ${sameRatingEarlier}))`;
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
