import { BasePriceParamsSchema } from "@api/products/components/basePrice/basePrice";
import { PlanItemFilterSchema } from "@api/products/items/filter/planItemFilter";
import { z } from "zod/v4";
import { UpdatePlanItemParamsV1Schema } from "../../../../billing/common/customizePlan/customizePlanV1.js";
import { CreatePlanItemParamsV1Schema } from "../../../../products/items/crud/createPlanItemParamsV1.js";
import { PlanFilterSchema } from "../../../filters/planFilter.js";

export const MigrationUpdatePlanCustomizeSchema = z
	.object({
		price: BasePriceParamsSchema.nullable().optional(),
		add_items: z.array(CreatePlanItemParamsV1Schema).optional(),
		remove_items: z.array(PlanItemFilterSchema).optional(),
		update_items: z.array(UpdatePlanItemParamsV1Schema).optional(),
	})
	.refine(
		(data) =>
			data.price !== undefined ||
			data.add_items !== undefined ||
			data.remove_items !== undefined ||
			data.update_items !== undefined,
		{
			message:
				"update_plan.customize requires at least one of price, add_items, remove_items, or update_items",
		},
	);

/**
 * Ordered customer operation: update every customer product matched by
 * `plan_filter` using update-subscription plan-update semantics.
 */
export const UpdatePlanOpSchema = z
	.object({
		type: z.literal("update_plan"),
		plan_filter: PlanFilterSchema,
		version: z.number().int().positive().optional(),
		customize: MigrationUpdatePlanCustomizeSchema.optional(),
	})
	.refine(
		(data) => data.version !== undefined || data.customize !== undefined,
		{
			message: "update_plan requires at least one of version or customize",
		},
	);

export type MigrationUpdatePlanCustomize = z.infer<
	typeof MigrationUpdatePlanCustomizeSchema
>;

export type UpdatePlanOp = z.infer<typeof UpdatePlanOpSchema>;
