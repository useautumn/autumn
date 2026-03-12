import { UpdatePlanParamsV2Schema } from "@api/products/crud/updatePlanParamsV1.js";
import { idRegex } from "@utils/utils.js";
import { z } from "zod/v4";

export const UpdateVariantParamsSchema = z
	.object({
		plan_id: z.string().nonempty().regex(idRegex).meta({
			description: "The ID of the parent base plan.",
		}),
		variant_id: z.string().nonempty().regex(idRegex).meta({
			description: "The ID of the variant to update.",
		}),
	})
	.extend(
		UpdatePlanParamsV2Schema.omit({
			plan_id: true,
			new_plan_id: true,
			variant_id: true,
		}).shape,
	);

export type UpdateVariantParams = z.infer<typeof UpdateVariantParamsSchema>;
export type UpdateVariantParamsInput = z.input<
	typeof UpdateVariantParamsSchema
>;
