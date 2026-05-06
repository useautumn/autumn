import { z } from "zod/v4";
import { UpdatePlanOpSchema } from "./updatePlan/index.js";

/**
 * Operations applied to a matched customer's resources. Phase 1 ships
 * only `update_plans`. `add_plans` / `remove_plans` slots reserved for
 * phase 2+.
 */
export const CustomerOperationsSchema = z
	.object({
		update_plans: z.array(UpdatePlanOpSchema).optional(),
	})
	.check((ctx) => {
		if ((ctx.value.update_plans?.length ?? 0) === 0) {
			ctx.issues.push({
				code: "custom",
				message: "operations.customer requires at least one operation",
				input: ctx.value,
			});
		}
	});

export type CustomerOperations = z.infer<typeof CustomerOperationsSchema>;
