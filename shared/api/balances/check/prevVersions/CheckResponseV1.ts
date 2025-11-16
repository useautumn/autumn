import { z } from "zod/v4";
import { CoreCusFeatureSchema } from "../../../customers/cusFeatures/previousVersions/apiCusFeatureV3.js";

const checkDescriptions = {
	allowed: "Whether the customer has access to the feature",
	code: "Code describing the result of the check",
	customer_id: "ID of the customer",
	feature_id: "ID of the feature",
	entity_id: "ID of the entity",
	required_balance: "Balance of the feature the customer is required to have.",
};

export const CHECK_RESPONSE_V1_EXAMPLE = {
	allowed: true,
	code: "feature_found",
	customer_id: "customer_123",
	feature_id: "api_tokens",
	required_balance: 5,
	interval: "month",
	interval_count: 1,
	unlimited: false,
	balance: 350,
	usage: 150,
	included_usage: 500,
	next_reset_at: 1731507600000,
	overage_allowed: false,
};

export const CheckResponseV1Schema = z
	.object({
		allowed: z.boolean().meta({
			description: checkDescriptions.allowed,
		}),
		code: z.string().meta({
			description: checkDescriptions.code,
		}),
		customer_id: z.string().meta({
			description: checkDescriptions.customer_id,
		}),
		feature_id: z.string().meta({
			description: checkDescriptions.feature_id,
		}),
		entity_id: z.string().nullish().meta({
			description: checkDescriptions.entity_id,
		}),
		required_balance: z.number().optional().meta({
			description: checkDescriptions.required_balance,
		}),
	})
	.extend(CoreCusFeatureSchema.shape)
	.meta({
		example: CHECK_RESPONSE_V1_EXAMPLE,
	});

export type CheckResponseV1 = z.infer<typeof CheckResponseV1Schema>;
