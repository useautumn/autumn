import { z } from "zod/v4";
import { ApiBalanceV1Schema } from "../../customers/cusFeatures/apiBalanceV1.js";
import { CheckFeaturePreviewSchema } from "./checkFeaturePreview.js";

/**
 * Check response V3 - uses ApiBalanceV1 (V2.1 format)
 * This is the server's internal response format
 */
export const CheckResponseV3Schema = z.object({
	allowed: z.boolean().meta({
		description:
			"Whether the customer is allowed to use the feature. True if they have sufficient balance or the feature is unlimited/boolean.",
	}),
	customer_id: z.string().meta({
		description: "The ID of the customer that was checked.",
	}),
	entity_id: z.string().nullish().meta({
		description: "The ID of the entity, if an entity-scoped check was performed.",
	}),
	required_balance: z.number().optional().meta({
		description: "The required balance that was checked against.",
	}),

	balance: ApiBalanceV1Schema.nullable().meta({
		description:
			"The customer's balance for this feature. Null if the customer has no balance for this feature.",
	}),

	preview: CheckFeaturePreviewSchema.optional().meta({
		description:
			"Upgrade/upsell information when access is denied. Only present if with_preview was true and allowed is false.",
	}),
});

export type CheckResponseV3 = z.infer<typeof CheckResponseV3Schema>;
