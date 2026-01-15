import { FeatureSchema, FeatureType, ResetInterval } from "@autumn/shared";
import { z } from "zod/v4";

const descriptions = {
	feature_id: "The feature ID to create the balance for",
	customer_id: "The customer ID to assign the balance to",
	entity_id: "Entity ID for entity-scoped balances",
	granted_balance: "The initial balance amount to grant",
	unlimited: "Whether the balance is unlimited",
	reset: "Reset configuration for the balance",
	expires_at: "Unix timestamp (milliseconds) when the balance expires",
};

export const CreateBalanceParamsSchema = z
	.object({
		feature_id: z.string().describe(descriptions.feature_id),
		customer_id: z.string().describe(descriptions.customer_id),
		entity_id: z.string().optional().describe(descriptions.entity_id),

		granted_balance: z.number().optional().describe(descriptions.granted_balance),
		unlimited: z.boolean().optional().describe(descriptions.unlimited),
		reset: z
			.object({
				interval: z.enum(ResetInterval),
				interval_count: z.number().optional(),
			})
			.optional().describe(descriptions.reset),
		expires_at: z.number().optional().describe(descriptions.expires_at), // Unix timestamp in milliseconds
	})
	.refine((data) => {
		if (data.entity_id && !data.customer_id) {
			return false;
		} else return true;
	});

export const ValidateCreateBalanceParamsSchema =
	CreateBalanceParamsSchema.extend({
		feature: FeatureSchema,
	}).refine((data) => {
		if (!data.feature) {
			return false;
		}

		if (data.feature.type === FeatureType.Boolean) {
			if (
				data.granted_balance !== undefined ||
				data.unlimited ||
				data.reset?.interval
			) {
				return false;
			}
		}

		if (data.feature.type === FeatureType.Metered) {
			if (data.granted_balance === undefined && !data.unlimited) {
				return false;
			}
			if (data.granted_balance !== undefined && data.unlimited) {
				return false;
			}
			if (data.unlimited && data.reset?.interval) {
				return false;
			}
		}

		return true;
	});

export type CreateBalanceParams = z.infer<typeof CreateBalanceParamsSchema>;
