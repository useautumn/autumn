import { ApiPlanSchema } from "@api/products/apiPlan.js";
import { z } from "zod/v4";

export const ApiSubscriptionV0Schema = z.object({
	plan: ApiPlanSchema.optional(),
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

	// feature_quantities: z.array(
	// 	z.object({
	// 		feature_id: z.string(),
	// 		quantity: z.number(),
	// 		upcoming_quantity: z.number().nullable(),
	// 	}),
	// ),
});

export type ApiSubscriptionV0 = z.infer<typeof ApiSubscriptionV0Schema>;
