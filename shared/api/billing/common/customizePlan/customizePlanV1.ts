import { BasePriceParamsSchema } from "@api/products/components/basePrice/basePrice";
import { CreatePlanItemParamsV1Schema } from "@api/products/items/crud/createPlanItemParamsV1";
import { z } from "zod/v4";

export const CustomizePlanV1Schema = z
	.object({
		price: BasePriceParamsSchema.nullable().optional(), // null to remove base price
		items: z.array(CreatePlanItemParamsV1Schema).optional(),
	})
	.refine((data) => data.items !== undefined || data.price !== undefined, {
		message: "When using customize, either items or price must be provided",
	});

export type CustomizePlanV1 = z.infer<typeof CustomizePlanV1Schema>;
