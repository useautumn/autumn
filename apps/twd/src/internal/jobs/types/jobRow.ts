import type { jobs } from "../../../db/schema/jobs.ts";

export type JobRow = typeof jobs.$inferSelect;
