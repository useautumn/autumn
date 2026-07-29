import { z } from "zod/v4";

export const CreateVariantParamsV2Schema = z.object({
	base_plan_id: z.string().nonempty().meta({
		description: "The ID of the base plan to fork into a variant.",
	}),
	variant_plan_id: z.string().nonempty().meta({
		description: "Unique identifier for the new variant plan.",
	}),
	name: z.string().nonempty().meta({
		description: "Display name of the variant.",
	}),
});

export type CreateVariantParamsV2 = z.infer<typeof CreateVariantParamsV2Schema>;
export type CreateVariantParamsV2Input = z.input<typeof CreateVariantParamsV2Schema>;
