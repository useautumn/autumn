import { z } from "zod/v4";

export const DeleteVariantParamsSchema = z.object({
	plan_id: z.string().nonempty().meta({
		description: "The ID of the parent base plan.",
	}),
	variant_id: z.string().nonempty().meta({
		description: "The ID of the variant to delete.",
	}),
});

export type DeleteVariantParams = z.infer<typeof DeleteVariantParamsSchema>;
export type DeleteVariantParamsInput = z.input<typeof DeleteVariantParamsSchema>;
