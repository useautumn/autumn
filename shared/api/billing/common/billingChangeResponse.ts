import { z } from "zod/v4";
import { CustomerPlanChangeSchema } from "./customerPlanChange";

export const BillingChangeResponseSchema = z.object({
	object: z.literal("billing.updated"),
	customer_id: z.string().meta({
		description: "The ID of the customer whose plans changed.",
	}),
	entity_id: z
		.string()
		.nullable()
		.optional()
		.meta({
			description:
				"The ID of the entity, if the changes are scoped to a specific entity.",
		}),
	plan_changes: z.array(CustomerPlanChangeSchema).meta({
		description:
			"The plans that were activated, scheduled, updated, or expired.",
	}),
	tags: z
		.array(z.string())
		.default([])
		.meta({
			description:
				"Reason tags describing why this event fired (e.g. 'trial_ended', 'phase_changed'). Always present; empty when no specific reason applies.",
		}),
});

export type BillingChangeResponse = z.infer<typeof BillingChangeResponseSchema>;
