import { z } from "zod/v4";

export const AttachLicenseEntityParamsSchema = z.object({
	entity_id: z.string().meta({
		description: "The ID of the entity to assign the license to.",
	}),
	name: z.string().nullish().meta({
		description: "The name of the entity, used when creating it.",
	}),
	feature_id: z.string().optional().meta({
		description:
			"The feature the entity is associated with. Required when the entity does not exist yet.",
	}),
});

export const AttachLicenseParamsV0Schema = z.object({
	customer_id: z.string(),
	plan_id: z.string(),
	// Entities are upserted: unknown ones are created before assignment.
	entities: z.array(AttachLicenseEntityParamsSchema).min(1),
});

export type AttachLicenseEntityParams = z.infer<
	typeof AttachLicenseEntityParamsSchema
>;
export type AttachLicenseParamsV0 = z.infer<typeof AttachLicenseParamsV0Schema>;
