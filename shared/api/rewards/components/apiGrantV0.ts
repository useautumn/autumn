import { makeDurationSchema } from "@api/common/duration/durationSchema.js";
import { EntitlementDuration } from "@models/productModels/entModels/entModels.js";
import { z } from "zod/v4";

export const ApiGrantV0Schema = z.object({
	feature_id: z.string().meta({
		description: "The feature ID this grant applies to.",
	}),
	included: z.number().nullable().meta({
		description:
			"The amount of the feature granted, or null for boolean features.",
	}),
	expiry: makeDurationSchema(
		EntitlementDuration,
		"The number of `type` periods before the granted amount expires.",
	)
		.nullable()
		.meta({
			description:
				"How long the granted amount lasts before expiring, or null for a permanent grant.",
		}),
});

export type ApiGrantV0 = z.infer<typeof ApiGrantV0Schema>;
