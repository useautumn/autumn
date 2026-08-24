import { z } from "zod/v4";
import { MutationLogItemSchema } from "../../types/mutationLogItem.js";

export const BALANCE_DEDUCTED = "balance_deducted";

const DeductionRequestFactSchema = z.object({
	feature_id: z.string(),
	amount: z.number(),
});

// The usage event the command carried; absent when the caller set skip_event.
const TrackedEventSchema = z.object({
	name: z.string(),
	value: z.number(),
	timestamp: z.number(),
	properties: z.record(z.string(), z.unknown()).optional(),
	idempotency_key: z.string().optional(),
});

export const BalanceDeductedFactsSchema = z.object({
	requests: z.array(DeductionRequestFactSchema),
	deductions: z.array(MutationLogItemSchema),
	remaining_by_feature_id: z.record(z.string(), z.number()),
	overage_behaviour: z.enum(["cap", "allow", "reject", "overflow"]),
	event: TrackedEventSchema.optional(),
});

export type BalanceDeductedFacts = z.infer<typeof BalanceDeductedFactsSchema>;
