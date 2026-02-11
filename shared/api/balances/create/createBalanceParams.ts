import { FeatureSchema, FeatureType, ResetInterval } from "@autumn/shared";
import { z } from "zod/v4";

const descriptions = {
	feature_id: "The feature ID to create the balance for",
	customer_id: "The customer ID to assign the balance to",
	entity_id: "Entity ID for entity-scoped balances",
	included: "The initial balance amount to grant",
	unlimited: "Whether the balance is unlimited",
	reset: "Reset configuration for the balance",
	expires_at: "Unix timestamp (milliseconds) when the balance expires",
};

export const ExtCreateBalanceParamsSchema = z
	.object({
		feature_id: z.string().describe(descriptions.feature_id),
		customer_id: z.string().describe(descriptions.customer_id),
		entity_id: z.string().optional().describe(descriptions.entity_id),

		included: z.number().optional().describe(descriptions.included),

		unlimited: z.boolean().optional().describe(descriptions.unlimited),
		reset: z
			.object({
				interval: z.enum(ResetInterval),
				interval_count: z.number().optional(),
			})
			.optional()
			.describe(descriptions.reset),
		expires_at: z.number().optional().describe(descriptions.expires_at), // Unix timestamp in milliseconds
	})
	.refine((data) => {
		if (data.entity_id && !data.customer_id) {
			return false;
		} else return true;
	});

export const CreateBalanceParamsV0Schema = ExtCreateBalanceParamsSchema.extend({
	granted_balance: z.number().optional(),
});

export const ValidateCreateBalanceParamsSchema =
	CreateBalanceParamsV0Schema.extend({
		feature: FeatureSchema,
	}).refine((data) => {
		if (!data.feature) {
			return false;
		}

		const included = data.included ?? data.granted_balance;

		if (data.feature.type === FeatureType.Boolean) {
			if (included !== undefined || data.unlimited || data.reset?.interval) {
				return false;
			}
		}

		if (data.feature.type === FeatureType.Metered) {
			if (included === undefined && !data.unlimited) {
				return false;
			}
			if (included !== undefined && data.unlimited) {
				return false;
			}
			if (data.unlimited && data.reset?.interval) {
				return false;
			}
		}

		return true;
	});

export type CreateBalanceParamsV0 = z.infer<typeof CreateBalanceParamsV0Schema>;
