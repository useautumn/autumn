import type { ModelsDevCost } from "@autumn/shared";
import { z } from "zod/v4";

const rate = z.number().min(0);

const ContextTierSchema = z.strictObject({
	input: rate,
	output: rate,
	cache_read: rate.optional(),
	cache_write: rate.optional(),
	input_audio: rate.optional(),
	reasoning: rate.optional(),
	tier: z.strictObject({ type: z.literal("context"), size: rate }),
});

const BillableModelCostSchema = z.strictObject({
	input: rate,
	output: rate,
	cache_read: rate.optional(),
	cache_write: rate.optional(),
	input_audio: rate.optional(),
	output_audio: rate.optional(),
	reasoning: rate.optional(),
	tiers: z.array(ContextTierSchema).optional(),
	context_over_200k: z
		.strictObject({
			input: rate,
			output: rate,
			cache_read: rate.optional(),
			cache_write: rate.optional(),
		})
		.optional(),
});

export const isBillableModelCost = (cost: unknown): cost is ModelsDevCost =>
	BillableModelCostSchema.safeParse(cost).success;
