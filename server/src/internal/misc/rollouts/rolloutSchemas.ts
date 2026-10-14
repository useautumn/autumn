import { z } from "zod/v4";

export const RolloutDecreaseSchema = z.object({
	from: z.number().min(0).max(100),
	to: z.number().min(0).max(100),
	at: z.number(),
});

export const RolloutPercentSchema = z.object({
	percent: z.number().min(0).max(100).default(0),
	previousPercent: z.number().min(0).max(100).default(0),
	changedAt: z.number().default(0),
	decreases: z.array(RolloutDecreaseSchema).default([]),
});

export const RolloutCustomerSchema = z.object({
	addedAt: z.number(),
	removedAt: z.number().optional(),
});

export const RolloutEntrySchema = RolloutPercentSchema.extend({
	orgs: z.record(z.string(), RolloutPercentSchema).default({}),
	customers: z
		.record(z.string(), z.record(z.string(), RolloutCustomerSchema))
		.default({}),
});

export const RolloutConfigSchema = z.object({
	rollouts: z.record(z.string(), RolloutEntrySchema).default({}),
});

export type RolloutDecrease = z.infer<typeof RolloutDecreaseSchema>;
export type RolloutPercent = z.infer<typeof RolloutPercentSchema>;
export type RolloutCustomer = z.infer<typeof RolloutCustomerSchema>;
export type RolloutEntry = z.infer<typeof RolloutEntrySchema>;
export type RolloutConfig = z.infer<typeof RolloutConfigSchema>;
