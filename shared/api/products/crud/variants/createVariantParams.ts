import { idRegex } from "@utils/utils.js";
import { z } from "zod/v4";

export const CreateVariantParamsSchema = z.object({
	plan_id: z.string().nonempty().meta({
		description: "The ID of the parent base plan.",
	}),
	variant_id: z.string().nonempty().regex(idRegex).meta({
		description: "Unique identifier for the variant (e.g. 'monthly').",
	}),
	variant_name: z.string().nonempty().meta({
		description: "Display name for the variant (e.g. 'Pro Monthly').",
	}),
});

export type CreateVariantParams = z.infer<typeof CreateVariantParamsSchema>;
export type CreateVariantParamsInput = z.input<
	typeof CreateVariantParamsSchema
>;
