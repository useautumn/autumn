import { z } from "zod/v4";

/**
 * Per-feature balance change in a migration preview.
 *
 * Shape mirrors the `billing.updated` webhook: `balance` is a small subset
 * of `ApiBalanceV1` representing the post-migration state, plus
 * `previous_attributes` (sparse — only fields whose value differs from
 * pre-migration). The dashboard can render "granted: 100 → 250" by overlaying
 * `previous_attributes` on top of the snapshot.
 */
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
