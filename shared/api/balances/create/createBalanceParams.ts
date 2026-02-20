import { FeatureSchema, FeatureType, ResetInterval } from "@autumn/shared";
import { z } from "zod/v4";
import { BalanceParamsBaseSchema } from "../common/balanceParamsBase";

export const ExtCreateBalanceParamsSchema = BalanceParamsBaseSchema.extend({
	included: z.number().optional().meta({
		description:
			"The initial balance amount to grant. For metered features, this is the number of units the customer can use.",
	}),

	unlimited: z.boolean().optional().meta({
		description:
			"If true, the balance has unlimited usage. Cannot be combined with 'included'.",
	}),
	reset: z
		.object({
			interval: z.enum(ResetInterval).meta({
				description:
					"The interval at which the balance resets (e.g., 'month', 'day', 'year').",
			}),
			interval_count: z.number().optional().meta({
				description:
					"Number of intervals between resets. Defaults to 1 (e.g., interval_count: 2 with interval: 'month' resets every 2 months).",
			}),
		})
		.optional()
		.meta({
			description:
				"Reset configuration for the balance. If not provided, the balance is a one-time grant that never resets.",
		}),
	expires_at: z.number().optional().meta({
		description:
			"Unix timestamp (milliseconds) when the balance expires. Mutually exclusive with reset.",
	}),
}).refine((data) => {
	if (data.entity_id && !data.customer_id) {
		return false;
	} else return true;
});

export const CreateBalanceParamsV0Schema = ExtCreateBalanceParamsSchema.extend({
	granted_balance: z.number().optional().meta({
		internal: true,
	}),
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
