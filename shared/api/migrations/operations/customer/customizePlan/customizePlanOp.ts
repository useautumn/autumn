import { BasePriceParamsSchema } from "@api/products/components/basePrice/basePrice";
import { PlanItemFilterSchema } from "@api/products/items/filter/planItemFilter";
import { z } from "zod/v4";
import { CreatePlanItemParamsV1Schema } from "../../../../products/items/crud/createPlanItemParamsV1.js";
import { PlanFilterSchema } from "../../../filters/planFilter.js";

export const MigrationCustomizePlanSchema = z
	.object({
		price: BasePriceParamsSchema.nullable().optional(),
		add_items: z.array(CreatePlanItemParamsV1Schema).optional(),
		remove_items: z.array(PlanItemFilterSchema).optional(),
	})
	.refine(
		(data) =>
			data.price !== undefined ||
			data.add_items !== undefined ||
			data.remove_items !== undefined,
		{
			message:
				"customize_plan.customize requires at least one of price, add_items, or remove_items",
		},
	);

/**
 * Ordered customer operation: patch every customer product matched by
 * `plan_filter` using update-subscription customize-plan semantics.
 */
export const CustomizePlanOpSchema = z.object({
	type: z.literal("customize_plan"),
	plan_filter: PlanFilterSchema,
	customize: MigrationCustomizePlanSchema,
});

export type MigrationCustomizePlan = z.infer<
	typeof MigrationCustomizePlanSchema
>;

export type CustomizePlanOp = z.infer<typeof CustomizePlanOpSchema>;
