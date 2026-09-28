import { UsageWindowSchema } from "@autumn/shared";
import { z } from "zod/v4";

/** One windowed-cap counter as the usage_windows table stores it; the whole row, because the deduction re-stamps it on roll. */
export const workerUsageWindowSchema = UsageWindowSchema.extend({
	// The table stores this nullable with no default; the shared schema defaults it for cached rows.
	filter_key: z.string().nullable(),
}).strict();

export type WorkerUsageWindow = z.infer<typeof workerUsageWindowSchema>;
