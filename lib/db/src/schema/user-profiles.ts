import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const userProfilesTable = pgTable(
  "user_profiles",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    publicId: varchar("public_id", { length: 48 }).notNull(),
    normalizedPublicId: varchar("normalized_public_id", { length: 48 }).notNull(),
    isGuest: boolean("is_guest").notNull().default(true),
    onboardingComplete: boolean("onboarding_complete").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("user_profiles_user_id_idx").on(table.userId),
    uniqueIndex("user_profiles_normalized_public_id_idx").on(table.normalizedPublicId),
  ],
);

export const insertUserProfileSchema = createInsertSchema(userProfilesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfilesTable.$inferSelect;
