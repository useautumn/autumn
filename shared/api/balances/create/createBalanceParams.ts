import {
	FeatureSchema,
	FeatureType,
	ResetInterval,
	RolloverConfigSchema,
} from "@autumn/shared";
import { z } from "zod/v4";
import { BalanceParamsBaseSchema } from "../common/balanceParamsBase";

export const ExtCreateBalanceParamsSchema = BalanceParamsBaseSchema.extend({
	included_grant: z.number().optional().meta({
		description:
			"The initial balance amount to grant. For metered features, this is the number of units the customer can use.",
	}),

	unlimited: z.boolean().optional().meta({
		description:
			"If true, the balance has unlimited usage. Cannot be combined with 'included_grant'.",
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

	rollover: RolloverConfigSchema.optional().meta({
		description: "Rollover configuration for the balance.",
	}),

	expires_at: z.number().optional().meta({
		description:
			"Unix timestamp (milliseconds) when the balance expires. Mutually exclusive with reset.",
	}),

	next_reset_at: z.number().optional().meta({
		description:
			"Unix timestamp (milliseconds) for the first reset boundary, allowing a custom (e.g. shorter) first period. Requires 'reset', and must occur before 'expires_at' if both are provided. Subsequent resets advance by one reset interval from this boundary.",
	}),

	balance_id: z.string().optional().meta({
		description:
			"A unique identifier for this balance. Use this to target the balance in future update / delete calls.",
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
	}).superRefine((data, ctx) => {
		const included = data.included_grant ?? data.granted_balance;
		const fail = (message: string) => ctx.addIssue({ code: "custom", message });

		if (data.feature.type === FeatureType.Boolean) {
			if (included !== undefined)
				fail("boolean features cannot have included_grant");
			if (data.unlimited) fail("boolean features cannot be unlimited");
			if (data.reset?.interval) fail("boolean features cannot have reset");
		}

		if (data.feature.type === FeatureType.Metered) {
			if (included === undefined && !data.unlimited)
				fail("included_grant or unlimited is required for metered features");
			if (included !== undefined && data.unlimited)
				fail("included_grant cannot be combined with unlimited");
			if (data.unlimited && data.reset?.interval)
				fail("reset cannot be combined with unlimited");
		}
	});

export type CreateBalanceParamsV0 = z.infer<typeof CreateBalanceParamsV0Schema>;
