import { pgTable, text, varchar } from "drizzle-orm/pg-core";

export const userPublicIdReservationsTable = pgTable("user_public_id_reservations", {
  normalizedPublicId: varchar("normalized_public_id", { length: 48 }).primaryKey(),
  publicId: varchar("public_id", { length: 48 }).notNull(),
  userId: text("user_id").notNull(),
});
