import { ApiPlanV0Schema } from "@api/products/previousVersions/apiPlanV0";
import { z } from "zod/v4";

export const ApiSubscriptionSchema = z.object({
	plan: ApiPlanV0Schema.optional(),
	plan_id: z.string(),

	default: z.boolean(),
	add_on: z.boolean(),

	// Flags / timestamps
	status: z.enum(["active", "scheduled", "expired"]),
	past_due: z.boolean(),
	canceled_at: z.number().nullable(),
	expires_at: z.number().nullable(),
	trial_ends_at: z.number().nullable(),

	started_at: z.number(),
	current_period_start: z.number().nullable(),
	current_period_end: z.number().nullable(),
	quantity: z.number(),
});

export type ApiSubscription = z.infer<typeof ApiSubscriptionSchema>;
