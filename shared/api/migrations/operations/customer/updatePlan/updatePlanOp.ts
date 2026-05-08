import { z } from "zod/v4";
import { CreatePlanItemParamsV1Schema } from "../../../../products/items/crud/createPlanItemParamsV1.js";
import { PlanFilterSchema } from "../../../filters/planFilter.js";
import { PlanItemFilterSchema } from "../../../filters/planItemFilter.js";

/**
 * Patch a customer's matching plan instances in place. Mirrors the patch
 * fields of CustomizePlanV1.
 *
 * - `upsert_items` is idempotent: existing items matched on `feature_id`
 *   are kept (or updated); missing ones are inserted. Uses the
 *   `CreatePlanItemParamsV1` shape.
 * - `delete_items` uses `PlanItemFilter` to match items and remove them.
 *
 * Slots reserved for phase 2+: `cancel_at`, `price`, `free_trial`,
 * `update_items`, `replace_items`.
 */
export const UpdatePlanOpSchema = z
	.object({
		target: PlanFilterSchema,
		upsert_items: z.array(CreatePlanItemParamsV1Schema).optional(),
		delete_items: z.array(PlanItemFilterSchema).optional(),
	})
	.check((ctx) => {
		const hasUpserts = (ctx.value.upsert_items?.length ?? 0) > 0;
		const hasDeletes = (ctx.value.delete_items?.length ?? 0) > 0;
		if (!hasUpserts && !hasDeletes) {
			ctx.issues.push({
				code: "custom",
				message:
					"update_plans op requires non-empty upsert_items or delete_items",
				input: ctx.value,
			});
		}
	});

export type UpdatePlanOp = z.infer<typeof UpdatePlanOpSchema>;
