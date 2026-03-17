import { ApiPlanV1Schema } from "@api/products/apiPlanV1";
import { z } from "zod/v4";

/**
 * A change in the checkout (product being added, canceled, or expiring)
 */
export const BillingPreviewChangeSchema = z.object({
	plan_id: z.string().meta({
		description: "The ID of the plan affected by this preview change.",
	}),
	plan: ApiPlanV1Schema.optional().meta({
		description: "The full plan object if it was expanded in the response.",
	}),
	feature_quantities: z
		.array(
			z.object({
				feature_id: z.string().meta({
					description:
						"The ID of the adjustable feature included in this change.",
				}),
				quantity: z.number().meta({
					description:
						"The quantity that will apply for this feature in the change.",
				}),
			}),
		)
		.meta({
			description:
				"The feature quantity selections associated with this plan change.",
		}),
	effective_at: z.number().nullable().meta({
		description:
			"When this change takes effect, in milliseconds since the Unix epoch, or null if it applies immediately.",
	}),
});

export type BillingPreviewChange = z.infer<typeof BillingPreviewChangeSchema>;
