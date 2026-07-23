import { z } from "zod/v4";

export const MiscellaneousEdgeConfigSchema = z.object({
	newFlatCusModel: z.array(z.string()).default([]),
	/** Global switch: coalesce balance syncs via per-customer Redis dirty state
	 *  (signal-only SQS messages). Dark by default. */
	syncCoalesce: z.boolean().default(false),
});

export type MiscellaneousEdgeConfig = z.infer<
	typeof MiscellaneousEdgeConfigSchema
>;
