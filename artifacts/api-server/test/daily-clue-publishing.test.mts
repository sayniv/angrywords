import assert from "node:assert/strict";
import test from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  DAILY_CLUE_PUBLISH_LIMIT,
  getSetterPublishLockSql,
  getUtcDayBounds,
  publishClueWithinDailyLimit,
} from "../src/lib/daily-clue-publishing.ts";

const postgresDialect = new PgDialect();

type StoredClue = {
  setterUserId: string;
  createdAt: Date;
  retiredAt?: Date | null;
  blockedAt?: Date | null;
};

class InMemoryQuotaStore {
  clues: StoredClue[] = [];
  private tails = new Map<string, Promise<void>>();

  async withSetterLock<T>(
    setterUserId: string,
    operation: (transaction: this) => Promise<T>,
  ): Promise<T> {
    const previous = this.tails.get(setterUserId) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.tails.set(setterUserId, tail);
    await previous;
    try {
      return await operation(this);
    } finally {
      release();
      if (this.tails.get(setterUserId) === tail) {
        this.tails.delete(setterUserId);
      }
    }
  }

  async countPublished(
    _transaction: this,
    setterUserId: string,
    start: Date,
    end: Date,
  ) {
    return this.clues.filter(
      (clue) =>
        clue.setterUserId === setterUserId &&
        clue.createdAt >= start &&
        clue.createdAt < end,
    ).length;
  }
}

async function publish(
  store: InMemoryQuotaStore,
  setterUserId: string,
  createdAt: Date,
) {
  return publishClueWithinDailyLimit(
    store,
    setterUserId,
    async (_transaction, timestamp) => {
      store.clues.push({ setterUserId, createdAt: timestamp });
      return store.clues.length;
    },
    () => createdAt,
  );
}

test("allows the tenth publication and rejects the eleventh", async () => {
  const store = new InMemoryQuotaStore();
  const now = new Date("2026-11-01T12:00:00.000Z");

  for (let index = 0; index < DAILY_CLUE_PUBLISH_LIMIT - 1; index += 1) {
    assert.equal((await publish(store, "setter-a", now)).allowed, true);
  }
  assert.equal((await publish(store, "setter-a", now)).allowed, true);
  assert.deepEqual(await publish(store, "setter-a", now), { allowed: false });
  assert.equal(store.clues.length, DAILY_CLUE_PUBLISH_LIMIT);
});

test("daily quotas are independent for each setter", async () => {
  const store = new InMemoryQuotaStore();
  const now = new Date("2026-11-01T12:00:00.000Z");
  for (let index = 0; index < DAILY_CLUE_PUBLISH_LIMIT; index += 1) {
    assert.equal((await publish(store, "setter-a", now)).allowed, true);
  }

  assert.equal((await publish(store, "setter-a", now)).allowed, false);
  assert.equal((await publish(store, "setter-b", now)).allowed, true);
});

test("UTC day bounds roll over at midnight and exclude the next day", () => {
  const { start, end } = getUtcDayBounds(
    new Date("2026-11-01T23:59:59.999Z"),
  );
  assert.equal(start.toISOString(), "2026-11-01T00:00:00.000Z");
  assert.equal(end.toISOString(), "2026-11-02T00:00:00.000Z");

  const afterMidnight = new Date("2026-11-02T00:00:00.000Z");
  assert.ok(afterMidnight >= end);
  assert.equal(getUtcDayBounds(afterMidnight).start.toISOString(), end.toISOString());
});

test("a setter can publish again after the UTC day rolls over", async () => {
  const store = new InMemoryQuotaStore();
  const beforeMidnight = new Date("2026-11-01T23:59:59.999Z");
  for (let index = 0; index < DAILY_CLUE_PUBLISH_LIMIT; index += 1) {
    assert.equal((await publish(store, "setter-a", beforeMidnight)).allowed, true);
  }

  assert.equal(
    (await publish(store, "setter-a", new Date("2026-11-02T00:00:00.000Z")))
      .allowed,
    true,
  );
});

test("retired and blocked published clues still count toward the quota", async () => {
  const store = new InMemoryQuotaStore();
  const now = new Date("2026-11-01T12:00:00.000Z");
  store.clues = Array.from({ length: DAILY_CLUE_PUBLISH_LIMIT }, (_, index) => ({
    setterUserId: "setter-a",
    createdAt: new Date(now.getTime() - index * 1_000),
    retiredAt: index % 2 ? now : null,
    blockedAt: index % 2 ? null : now,
  }));

  assert.equal((await publish(store, "setter-a", now)).allowed, false);
});

test("simultaneous publications do not exceed the daily limit", async () => {
  const store = new InMemoryQuotaStore();
  const now = new Date("2026-11-01T12:00:00.000Z");
  for (let index = 0; index < DAILY_CLUE_PUBLISH_LIMIT - 2; index += 1) {
    store.clues.push({ setterUserId: "setter-a", createdAt: now });
  }

  const results = await Promise.all(
    Array.from({ length: 8 }, () => publish(store, "setter-a", now)),
  );
  assert.equal(results.filter((result) => result.allowed).length, 2);
  assert.equal(store.clues.length, DAILY_CLUE_PUBLISH_LIMIT);
});

test("the transaction advisory lock is scoped to the setter ID", () => {
  const firstSetterLock = postgresDialect.sqlToQuery(
    getSetterPublishLockSql("setter-a"),
  );
  const secondSetterLock = postgresDialect.sqlToQuery(
    getSetterPublishLockSql("setter-b"),
  );

  assert.match(
    firstSetterLock.sql,
    /pg_advisory_xact_lock\(hashtextextended\(\$1, 0\)\)/,
  );
  assert.deepEqual(firstSetterLock.params, ["setter-a"]);
  assert.deepEqual(secondSetterLock.params, ["setter-b"]);
});
