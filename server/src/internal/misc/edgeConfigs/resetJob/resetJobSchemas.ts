import { z } from "zod/v4";

export const DEFAULT_RESET_BATCH_SIZE = 500;
export const MAX_RESET_BATCH_SIZE = 2_000;

export const ResetJobConfigSchema = z.object({
	enabled: z.boolean().default(false),
	batchSize: z
		.number()
		.int()
		.min(1)
		.max(MAX_RESET_BATCH_SIZE)
		.default(DEFAULT_RESET_BATCH_SIZE),
});

export type ResetJobConfig = z.infer<typeof ResetJobConfigSchema>;
