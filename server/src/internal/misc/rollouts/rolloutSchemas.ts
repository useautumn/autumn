import { z } from "zod/v4";

/** A percent going down: the buckets in [to, from) left the worker at `at` plus the settle window. */
export const RolloutDecreaseSchema = z.object({
	from: z.number().min(0).max(100),
	to: z.number().min(0).max(100),
	at: z.number(),
});

export const RolloutPercentSchema = z.object({
	percent: z.number().min(0).max(100).default(0),
	previousPercent: z.number().min(0).max(100).default(0),
	changedAt: z.number().default(0),
	/** Recent decreases, oldest first; the cache uses them to spot a legacy view from before a worker stint. */
	decreases: z.array(RolloutDecreaseSchema).default([]),
});

export const RolloutEntrySchema = RolloutPercentSchema.extend({
	orgs: z.record(z.string(), RolloutPercentSchema).default({}),
});

export const RolloutConfigSchema = z.object({
	rollouts: z.record(z.string(), RolloutEntrySchema).default({}),
});

export type RolloutDecrease = z.infer<typeof RolloutDecreaseSchema>;
export type RolloutPercent = z.infer<typeof RolloutPercentSchema>;
export type RolloutEntry = z.infer<typeof RolloutEntrySchema>;
export type RolloutConfig = z.infer<typeof RolloutConfigSchema>;
