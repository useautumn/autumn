import { DiffedCustomizePlanV1Schema } from "@utils/planV1Utils/diff/diffPlanV1.js";
import { idRegex } from "@utils/utils";
import { z } from "zod/v4";
import { MigrationParamsSchema } from "../migrationParams.js";

export const UpdateVariantParamsSchema = z.object({
	variant_plan_id: z.string().nonempty().regex(idRegex).meta({
		description: "The variant plan ID to update or create.",
	}),
	name: z.string().nonempty().optional().meta({
		description:
			"Display name to use when creating the variant if it does not exist.",
	}),
	customize: DiffedCustomizePlanV1Schema.meta({
		description: "The exact customize patch to apply to this variant.",
	}),
	disable_version: z.boolean().optional().meta({
		description:
			"Edit this variant in place instead of versioning it for this update.",
		internal: true,
	}),
	force_version: z.boolean().optional().meta({
		description: "Force this variant update to create a new version.",
		internal: true,
	}),
	migration: MigrationParamsSchema.optional().meta({
		description:
			"Migration draft options for an in-place direct variant update.",
		internal: true,
	}),
});

export type UpdateVariantParams = z.infer<typeof UpdateVariantParamsSchema>;
export type UpdateVariantParamsInput = z.input<
	typeof UpdateVariantParamsSchema
>;
