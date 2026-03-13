import { z } from "zod/v4";
import { ApiFeatureV1Schema } from "../../features/apiFeatureV1";

export const API_FLAG_V0_EXAMPLE = {
	id: "cus_ent_39qmLooixXLAqMywgXywjAz96rV",
	plan_id: "pro_plan",
	expires_at: null,
	feature_id: "dashboard",
};

export const ApiFlagV0Schema = z
	.object({
		object: z.literal("flag").meta({
			internal: true,
		}),
		id: z.string().meta({
			description: "The unique identifier for this flag.",
		}),
		plan_id: z.string().nullable().meta({
			description:
				"The plan ID this flag originates from, or null for standalone flags.",
		}),
		expires_at: z.number().nullable().meta({
			description:
				"Timestamp when this flag expires, or null for no expiration.",
		}),
		feature_id: z.string().meta({
			description: "The feature ID this flag is for.",
		}),
		feature: ApiFeatureV1Schema.optional().meta({
			description: "The full feature object if expanded.",
		}),
	})
	.meta({
		examples: [API_FLAG_V0_EXAMPLE],
	});

export type ApiFlagV0 = z.infer<typeof ApiFlagV0Schema>;
