-- Run with: psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/benchmark-clue-rating-listing.sql
-- This benchmark creates only temporary tables; it does not modify application data.
\timing on

CREATE TEMP TABLE bench_clues (
  id integer PRIMARY KEY,
  created_at timestamptz NOT NULL,
  retired_at timestamptz,
  blocked_at timestamptz
);

CREATE TEMP TABLE bench_clue_ratings (
  clue_id integer NOT NULL,
  user_id integer NOT NULL,
  rating integer NOT NULL,
  PRIMARY KEY (clue_id, user_id)
);

INSERT INTO bench_clues
SELECT id, now() - (id || ' seconds')::interval, NULL, NULL
FROM generate_series(1, 100000) AS id;

INSERT INTO bench_clue_ratings
SELECT clue_id, user_id,
  greatest(1, least(5, 2 + ((user_id + clue_id) % 5) - (clue_id % 4)))
FROM generate_series(1, 100000) AS clue_id
CROSS JOIN generate_series(1, 20) AS user_id;

VACUUM (ANALYZE) bench_clues;
VACUUM (ANALYZE) bench_clue_ratings;

\echo 'Baseline: 100,000 clues and 2,000,000 ratings; unique (clue_id,user_id) index only'
EXPLAIN (ANALYZE, BUFFERS, SUMMARY, TIMING OFF)
SELECT c.id, r.average_rating, r.rating_count
FROM bench_clues AS c
LEFT JOIN (
  SELECT clue_id, avg(rating) AS average_rating, count(*) AS rating_count
  FROM bench_clue_ratings
  GROUP BY clue_id
) AS r ON r.clue_id = c.id
WHERE c.retired_at IS NULL AND c.blocked_at IS NULL
ORDER BY r.average_rating DESC NULLS LAST,
  coalesce(r.rating_count, 0) DESC,
  c.created_at DESC,
  c.id DESC
LIMIT 26;

CREATE INDEX bench_clue_ratings_clue_rating_idx
  ON bench_clue_ratings (clue_id, rating);
VACUUM (ANALYZE) bench_clue_ratings;

\echo 'With clue-rating index: same paged popular-list query'
EXPLAIN (ANALYZE, BUFFERS, SUMMARY, TIMING OFF)
SELECT c.id, r.average_rating, r.rating_count
FROM bench_clues AS c
LEFT JOIN (
  SELECT clue_id, avg(rating) AS average_rating, count(*) AS rating_count
  FROM bench_clue_ratings
  GROUP BY clue_id
) AS r ON r.clue_id = c.id
WHERE c.retired_at IS NULL AND c.blocked_at IS NULL
ORDER BY r.average_rating DESC NULLS LAST,
  coalesce(r.rating_count, 0) DESC,
  c.created_at DESC,
  c.id DESC
LIMIT 26;
