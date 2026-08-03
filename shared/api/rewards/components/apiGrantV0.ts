import { EntitlementDuration } from "@models/productModels/entModels/entModels.js";
import { z } from "zod/v4";

const GrantExpirySchema = z.object({
	type: z.enum(EntitlementDuration).meta({
		description: "The unit of time the grant lasts.",
	}),
	length: z.number().int().positive().meta({
		description:
			"The positive integer count of periods before the grant expires.",
	}),
});

export const ApiGrantV0Schema = z.object({
	feature_id: z.string().meta({
		description: "The feature ID this grant applies to.",
	}),
	included: z.number().nullable().meta({
		description:
			"The amount of the feature granted, or null for boolean features.",
	}),
	expiry: GrantExpirySchema.nullable().meta({
		description:
			"How long the granted amount lasts before expiring, or null for a permanent grant.",
	}),
});

export type ApiGrantV0 = z.infer<typeof ApiGrantV0Schema>;
