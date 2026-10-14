import { z } from "zod/v4";

export const PreviewBalanceSchema = z.object({
	granted: z.number(),
	remaining: z.number(),
	usage: z.number(),
	unlimited: z.boolean(),
	next_reset_at: z.number().nullable(),
});

export const PreviewBalanceChangeSchema = z.object({
	feature_id: z.string(),
	balance: PreviewBalanceSchema,
	previous_attributes: z.record(z.string(), z.unknown()).default({}),
});

export type PreviewBalance = z.infer<typeof PreviewBalanceSchema>;
export type PreviewBalanceChange = z.infer<typeof PreviewBalanceChangeSchema>;
