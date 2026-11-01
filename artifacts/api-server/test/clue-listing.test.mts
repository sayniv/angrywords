import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  decodeClueListingCursor,
  encodeClueListingCursor,
  getClueListingCursorCondition,
  getClueListingPageCondition,
  getClueListingOrder,
  type ClueListingCursor,
} from "../src/lib/clue-listing.ts";
import { ListCluesResponse } from "@workspace/api-zod";

const dialect = new PgDialect();
const cursor: ClueListingCursor = {
  sort: "rating",
  createdAt: "2026-11-01T12:00:00.000Z",
  id: 42,
  averageRating: "4.25",
  ratingCount: 8,
};

test("clue listing cursors preserve the sort tuple and reject malformed values", () => {
  const encoded = encodeClueListingCursor(cursor);
  assert.deepEqual(decodeClueListingCursor(encoded), cursor);
  assert.equal(decodeClueListingCursor("not-a-valid-cursor"), null);
  assert.equal(
    decodeClueListingCursor(encodeClueListingCursor({ ...cursor, id: 0 })),
    null,
  );
});

test("listing order includes deterministic tie-breakers for every page boundary", () => {
  const fields = {
    averageRating: sql`"ratings"."average_rating"`,
    ratingCount: sql`coalesce("ratings"."rating_count", 0)`,
    createdAt: sql`"clues"."created_at"`,
    id: sql`"clues"."id"`,
  };

  const newestSql = dialect.sqlToQuery(sql.join(getClueListingOrder(false, fields), sql`, `)).sql;
  assert.match(newestSql, /"clues"\."created_at" desc, "clues"\."id" desc/i);

  const popularSql = dialect.sqlToQuery(sql.join(getClueListingOrder(true, fields), sql`, `)).sql;
  assert.match(
    popularSql,
    /"ratings"\."average_rating" DESC NULLS LAST, coalesce\("ratings"\."rating_count", 0\) desc, "clues"\."created_at" desc, "clues"\."id" desc/i,
  );
});

test("rating cursors continue through equal-rating ties and the unrated tail", () => {
  const fields = {
    averageRating: sql`"ratings"."average_rating"`,
    ratingCount: sql`coalesce("ratings"."rating_count", 0)`,
    createdAt: sql`"clues"."created_at"`,
    id: sql`"clues"."id"`,
  };
  const equalRatingCondition = dialect.sqlToQuery(getClueListingCursorCondition(
    cursor,
    fields,
  ));
  assert.match(equalRatingCondition.sql, /"ratings"\."average_rating" = \$\d+/);
  assert.match(equalRatingCondition.sql, /coalesce\("ratings"\."rating_count", 0\) < \$\d+/);
  assert.match(equalRatingCondition.sql, /"clues"\."created_at" < /);
  assert.match(equalRatingCondition.sql, /"clues"\."id" < /);
  assert.ok(equalRatingCondition.params.includes(cursor.averageRating));
  assert.ok(equalRatingCondition.params.includes(cursor.ratingCount));

  const unratedCondition = dialect.sqlToQuery(getClueListingCursorCondition(
    { ...cursor, averageRating: null, ratingCount: 0 },
    fields,
  ));

  assert.match(unratedCondition.sql, /"ratings"\."average_rating" is null/i);
  assert.match(unratedCondition.sql, /coalesce\("ratings"\."rating_count", 0\) < \$1/);
  assert.match(unratedCondition.sql, /"clues"\."created_at" < /);
  assert.match(unratedCondition.sql, /"clues"\."id" < /);
  assert.equal(unratedCondition.params[0], 0);
  assert.ok(unratedCondition.params.includes("2026-11-01T12:00:00.000Z"));

  const preciseTimestamp = "2026-11-01T12:00:00.123456Z";
  const preciseCondition = dialect.sqlToQuery(getClueListingCursorCondition(
    { ...cursor, sort: "newest", createdAt: preciseTimestamp },
    fields,
  ));
  assert.ok(preciseCondition.params.includes(preciseTimestamp));
});

test("later clue pages keep excluding clues that are blocked or retired", () => {
  const fields = {
    averageRating: sql`"ratings"."average_rating"`,
    ratingCount: sql`coalesce("ratings"."rating_count", 0)`,
    createdAt: sql`"clues"."created_at"`,
    id: sql`"clues"."id"`,
  };
  const pageCondition = dialect.sqlToQuery(getClueListingPageCondition(
    sql`"clues"."retired_at"`,
    sql`"clues"."blocked_at"`,
    cursor,
    fields,
  ));

  assert.match(pageCondition.sql, /"clues"\."retired_at" is null/i);
  assert.match(pageCondition.sql, /"clues"\."blocked_at" is null/i);
  assert.match(pageCondition.sql, /"ratings"\."average_rating" < \$/i);
  assert.match(pageCondition.sql, /"clues"\."created_at" < \$/i);
  assert.ok(pageCondition.params.includes(cursor.averageRating));
  assert.ok(pageCondition.params.includes(cursor.createdAt));
  assert.ok(pageCondition.params.includes(cursor.id));

  const firstPageCondition = dialect.sqlToQuery(getClueListingPageCondition(
    sql`"clues"."retired_at"`,
    sql`"clues"."blocked_at"`,
    null,
    fields,
  ));
  assert.match(firstPageCondition.sql, /"clues"\."retired_at" is null/i);
  assert.match(firstPageCondition.sql, /"clues"\."blocked_at" is null/i);
  assert.doesNotMatch(firstPageCondition.sql, /"ratings"\."average_rating" < \$/i);
});

test("clue listing pages validate the items and provide an optional next cursor", () => {
  const page = ListCluesResponse.parse({
    items: [{
      id: 42,
      slug: "clue-42",
      clue: "A small example",
      answerLength: 5,
      maxAttempts: 5,
      setterName: "PuzzleFriend",
      setterBlurb: null,
      solveCount: 0,
      averageRating: null,
      ratingCount: 0,
      isBlocked: false,
      createdAt: "2026-11-01T12:00:00.000Z",
    }],
    nextCursor: "opaque-cursor",
  });

  assert.equal(page.items.length, 1);
  assert.equal(page.items[0]?.createdAt instanceof Date, true);
  assert.equal(page.nextCursor, "opaque-cursor");
  assert.deepEqual(ListCluesResponse.parse({ items: [], nextCursor: null }), {
    items: [],
    nextCursor: null,
  });
});
