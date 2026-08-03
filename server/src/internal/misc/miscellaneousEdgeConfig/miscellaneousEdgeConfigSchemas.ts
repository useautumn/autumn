import { z } from "zod/v4";

export const MiscellaneousEdgeConfigSchema = z.object({
	newFlatCusModel: z.array(z.string()).default([]),
	/** Global switch: coalesce balance syncs via per-customer Redis dirty state
	 *  (signal-only SQS messages). Dark by default. */
	syncCoalesce: z.boolean().default(false),
	/** Global switch: customer get_or_create and entity get read the subject
	 *  straight from Postgres, bypassing the FullSubject cache entirely. */
	subjectLookupDbOnly: z.boolean().default(false),
	tinybirdDailyRollups: z.boolean().default(false),
});

export type MiscellaneousEdgeConfig = z.infer<
	typeof MiscellaneousEdgeConfigSchema
>;
