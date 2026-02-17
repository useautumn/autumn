import { FreeTrialParamsV1Schema } from "@api/common/freeTrial/freeTrialParamsV1.js";
import { BasePriceParamsSchema } from "@api/products/components/basePrice/basePrice.js";
import { idRegex } from "@utils/utils.js";
import { z } from "zod/v4";
import { CreatePlanItemParamsV1Schema } from "../items/crud/createPlanItemParamsV1.js";

export const CreatePlanParamsV1Schema = z.object({
	id: z.string().nonempty().regex(idRegex),
	group: z.string().default(""),

	name: z.string().nonempty(),
	description: z.string().nullable().default(null),

	add_on: z.boolean().default(false),
	auto_enable: z.boolean().default(false),

	price: BasePriceParamsSchema.optional(),

	items: z.array(CreatePlanItemParamsV1Schema).optional(),
	free_trial: FreeTrialParamsV1Schema.optional(),
});

export type CreatePlanParams = z.infer<typeof CreatePlanParamsV1Schema>;
export type CreatePlanParamsInput = z.input<typeof CreatePlanParamsV1Schema>;
