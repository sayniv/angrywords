import { sql } from "drizzle-orm";

export const DAILY_CLUE_PUBLISH_LIMIT = 10;

export type UtcDayBounds = {
  start: Date;
  end: Date;
};

export function getUtcDayBounds(date: Date): UtcDayBounds {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  return {
    start,
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000),
  };
}

export function getSetterPublishLockSql(setterUserId: string) {
  return sql`SELECT pg_advisory_xact_lock(hashtextextended(${setterUserId}, 0))`;
}

export type DailyClueQuotaStore<Transaction> = {
  withSetterLock<T>(
    setterUserId: string,
    operation: (transaction: Transaction) => Promise<T>,
  ): Promise<T>;
  countPublished(
    transaction: Transaction,
    setterUserId: string,
    start: Date,
    end: Date,
  ): Promise<number>;
};

export type DailyCluePublishResult<T> =
  | { allowed: true; created: T }
  | { allowed: false };

export async function publishClueWithinDailyLimit<Transaction, Clue>(
  store: DailyClueQuotaStore<Transaction>,
  setterUserId: string,
  create: (transaction: Transaction, createdAt: Date) => Promise<Clue>,
  now: () => Date = () => new Date(),
): Promise<DailyCluePublishResult<Clue>> {
  return store.withSetterLock(setterUserId, async (transaction) => {
    const createdAt = now();
    const { start, end } = getUtcDayBounds(createdAt);
    const publishedCount = await store.countPublished(
      transaction,
      setterUserId,
      start,
      end,
    );
    if (publishedCount >= DAILY_CLUE_PUBLISH_LIMIT) {
      return { allowed: false };
    }
    return {
      allowed: true,
      created: await create(transaction, createdAt),
    };
  });
}
