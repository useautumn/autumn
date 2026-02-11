import { CreatePlanParamsV1Schema } from "@api/products/crud/createPlanParamsV0";
import { z } from "zod/v4";

export const UpdatePlanParamsV1Schema =
	CreatePlanParamsV1Schema.partial().extend({
		version: z.number().optional(),
		archived: z.boolean().default(false).optional(),
	});

export const UpdatePlanQuerySchema = z.object({
	version: z.number().optional(),
	upsert: z.boolean().optional(),
	disable_version: z.boolean().optional(),
});

export type UpdatePlanParams = z.infer<typeof UpdatePlanParamsV1Schema>;
export type UpdatePlanParamsInput = z.input<typeof UpdatePlanParamsV1Schema>;
