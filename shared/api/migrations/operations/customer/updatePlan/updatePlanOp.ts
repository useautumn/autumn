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
		update_items: z.array(UpdatePlanItemParamsV1Schema).optional().meta({
			description:
				"Deprecated. Use remove_items and add_items to replace matched plan items.",
			deprecated: true,
		}),
	})
	.refine(
		(data) =>
			data.price !== undefined ||
			data.add_items !== undefined ||
			data.remove_items !== undefined ||
			data.update_items !== undefined,
		{
			message:
				"update_plan.customize requires at least one of price, add_items, remove_items, or deprecated update_items",
		},
	);

export const FeatureQuantityStrategySchema = z.enum(["round_to_lowest_price"]);

export const MigrationFeatureQuantityStrategyParamsSchema = z.object({
	feature_id: z.string(),
	strategy: FeatureQuantityStrategySchema,
});

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
		feature_quantities_strategy: z
			.array(MigrationFeatureQuantityStrategyParamsSchema)
			.optional()
			.meta({
				internal: true,
				description:
					"Internal only, never exposed to the frontend/API. Resolves a customer-specific prepaid quantity per matched cusProduct instead of carrying the existing quantity forward unchanged.",
			}),
		proration: z.boolean().optional().meta({
			internal: true,
			description:
				"Internal only, never exposed to the frontend/API. Allows this operation to produce real proration/invoice charges instead of the default charge-free migration behavior.",
		}),
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

export type MigrationFeatureQuantityStrategyParams = z.infer<
	typeof MigrationFeatureQuantityStrategyParamsSchema
>;

export type UpdatePlanOp = z.infer<typeof UpdatePlanOpSchema>;
