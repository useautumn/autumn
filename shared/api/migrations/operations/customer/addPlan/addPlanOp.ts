import { z } from "zod/v4";

/**
 * Ordered customer operation: attach a plan to the customer. Skipped
 * (idempotent) if the customer already has an active cusProduct for the
 * target plan_id + version.
 *
 * Runs BEFORE update_plan operations so that a subsequent update_plan
 * can target the newly-attached plan.
 */
export const AddPlanOpSchema = z.object({
	type: z.literal("add_plan"),
	plan_id: z.string(),
	version: z.number().int().positive().optional(),
	feature_quantities: z
		.array(
			z.object({
				feature_id: z.string(),
				quantity: z.number().int().nonnegative(),
			}),
		)
		.optional(),
});

export type AddPlanOp = z.infer<typeof AddPlanOpSchema>;
