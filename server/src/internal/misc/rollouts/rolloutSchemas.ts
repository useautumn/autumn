import { z } from "zod/v4";

export const RolloutPercentSchema = z.object({
	percent: z.number().min(0).max(100).default(0),
	previousPercent: z.number().min(0).max(100).default(0),
	changedAt: z.number().default(0),
});

export const RolloutEntrySchema = RolloutPercentSchema.extend({
	orgs: z.record(z.string(), RolloutPercentSchema).default({}),
});

export const RolloutConfigSchema = z.object({
	rollouts: z.record(z.string(), RolloutEntrySchema).default({}),
});

export type RolloutPercent = z.infer<typeof RolloutPercentSchema>;
export type RolloutEntry = z.infer<typeof RolloutEntrySchema>;
export type RolloutConfig = z.infer<typeof RolloutConfigSchema>;
