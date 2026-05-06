import { z } from "zod/v4";
import { CreatePlanItemParamsV1Schema } from "../../../../products/items/crud/createPlanItemParamsV1.js";
import { PlanFilterSchema } from "../../../filters/planFilter.js";
import { PlanItemFilterSchema } from "../../../filters/planItemFilter.js";

/**
 * Patch a customer's matching plan instances in place. Mirrors the patch
 * fields of CustomizePlanV1.
 *
 * Phase 1 fields: `target`, `add_items`, `delete_items`. Slots reserved
 * for phase 2+: `cancel_at`, `price`, `free_trial`, `update_items`,
 * `replace_items`.
 *
 * - `add_items`  uses `CreatePlanItemParamsV1` (the create-plan-item
 *   shape). Phase 1 expects entitlement-only items; priced items defer
 *   to phase 2 auto-prep, enforced by handler-side validation.
 * - `delete_items` uses `PlanItemFilter` to match items on each target
 *   plan and remove them.
 */
export const UpdatePlanOpSchema = z
	.object({
		target: PlanFilterSchema,
		add_items: z.array(CreatePlanItemParamsV1Schema).optional(),
		delete_items: z.array(PlanItemFilterSchema).optional(),
	})
	.check((ctx) => {
		const hasAdds = (ctx.value.add_items?.length ?? 0) > 0;
		const hasDeletes = (ctx.value.delete_items?.length ?? 0) > 0;
		if (!hasAdds && !hasDeletes) {
			ctx.issues.push({
				code: "custom",
				message:
					"update_plans op requires non-empty add_items or delete_items",
				input: ctx.value,
			});
		}
	});

export type UpdatePlanOp = z.infer<typeof UpdatePlanOpSchema>;
