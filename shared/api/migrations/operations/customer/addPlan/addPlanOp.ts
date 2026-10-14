import { z } from "zod/v4";

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
