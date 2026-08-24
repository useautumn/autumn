import { z } from "zod/v4";

// Mirrors the deduction script's mutation_logs entries verbatim, so journal
// consumers read the same shape the server emits.
export const MutationLogItemSchema = z.object({
	target_type: z.enum(["customer_entitlement", "rollover"]),
	customer_entitlement_id: z.string().nullable(),
	rollover_id: z.string().nullable(),
	entity_id: z.string().nullable(),
	credit_cost: z.number(),
	balance_delta: z.number(),
	adjustment_delta: z.number(),
	usage_delta: z.number(),
	value_delta: z.number(),
});

export type MutationLogItem = z.infer<typeof MutationLogItemSchema>;
