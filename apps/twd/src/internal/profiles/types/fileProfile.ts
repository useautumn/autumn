import type { fileProfiles } from "../../../db/schema/profiles.ts";

export type FileProfile = typeof fileProfiles.$inferInsert;
