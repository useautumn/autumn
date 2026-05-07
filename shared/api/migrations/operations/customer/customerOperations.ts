import { z } from "zod/v4";
import { UpdatePlanOpSchema } from "./updatePlan/index.js";

/**
 * Operations applied to each matched customer.
 *
 * Phase 1 ships only `update_plans`. Slots reserved for phase 2+:
 * `remove_plans`, `add_plans` — when added, the orchestrator will
 * process them in the order remove → add → update so update_plans
 * can target plans the prior phases just attached.
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
