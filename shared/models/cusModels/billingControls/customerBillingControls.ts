import { z } from "zod/v4";
import {
	type EntityBillingControls,
	type EntityBillingControlsParams,
	EntityBillingControlsSchema,
} from "./entityBillingControls.js";
import { PurchaseLimitIntervalEnum } from "./purchaseLimitInterval.js";
import { type DbSpendLimit, DbSpendLimitSchema } from "./spendLimit.js";
import { type DbUsageAlert, DbUsageAlertSchema } from "./usageAlert.js";

export const AutoTopupPurchaseLimitSchema = z.object({
	interval: PurchaseLimitIntervalEnum.meta({
		description: "The time interval for the purchase limit window.",
	}),
	interval_count: z.number().min(1).default(1).meta({
		description: "Number of intervals in the purchase limit window.",
	}),
	limit: z.number().min(1).meta({
		description: "Maximum number of auto top-ups allowed within the interval.",
	}),
});

export const AutoTopupSchema = z.object({
	feature_id: z.string().meta({
		description: "The ID of the feature (credit balance) to auto top-up.",
	}),
	enabled: z.boolean().default(false).meta({
		description: "Whether auto top-up is enabled.",
	}),
	threshold: z.number().min(0).meta({
		description:
			"When the balance drops below this threshold, an auto top-up will be purchased.",
	}),
	quantity: z.number().min(1).meta({
		description: "Amount of credits to add per auto top-up.",
	}),
	purchase_limit: AutoTopupPurchaseLimitSchema.optional().meta({
		description: "Optional rate limit to cap how often auto top-ups occur.",
	}),
});

export const CustomerBillingControlsSchema = z.object({
	auto_topups: z.array(AutoTopupSchema).optional().meta({
		description: "List of auto top-up configurations per feature.",
	}),
	spend_limits: z.array(DbSpendLimitSchema).optional().meta({
		description: "List of overage spend limits per feature.",
	}),
	usage_alerts: z.array(DbUsageAlertSchema).optional().meta({
		description: "List of usage alert configurations per feature.",
	}),
});

export const CustomerBillingControlsParamsSchema =
	CustomerBillingControlsSchema.check((ctx) => {
		const billingControls = ctx.value;
		const featureIds = new Set<string>();

		for (const [index, spendLimit] of (
			billingControls.spend_limits ?? []
		).entries()) {
			if (!spendLimit.feature_id) {
				continue;
			}

			if (featureIds.has(spendLimit.feature_id)) {
				ctx.issues.push({
					code: "custom",
					message: "Only one spend limit entry is allowed per feature_id",
					input: spendLimit.feature_id,
					path: ["spend_limits", index, "feature_id"],
				});
				return;
			}

			featureIds.add(spendLimit.feature_id);
		}
	});

export type AutoTopupPurchaseLimit = z.infer<
	typeof AutoTopupPurchaseLimitSchema
>;
export type AutoTopup = z.infer<typeof AutoTopupSchema>;
export type CustomerBillingControls = z.infer<
	typeof CustomerBillingControlsSchema
>;

export type CustomerBillingControlsParams = z.input<
	typeof CustomerBillingControlsParamsSchema
>;

export { EntityBillingControlsSchema, DbSpendLimitSchema, DbUsageAlertSchema };
export type {
	EntityBillingControls,
	EntityBillingControlsParams,
	DbSpendLimit,
	DbUsageAlert,
};
