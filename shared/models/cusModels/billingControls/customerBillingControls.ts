import { z } from "zod/v4";
import {
	type EntityBillingControls,
	type EntityBillingControlsParams,
	EntityBillingControlsSchema,
} from "./entityBillingControls.js";
import {
	type DbOverageAllowed,
	DbOverageAllowedSchema,
	pickStricterOverageAllowed,
} from "./overageAllowed.js";
import { PurchaseLimitIntervalEnum } from "./purchaseLimitInterval.js";
import {
	type DbSpendLimit,
	DbSpendLimitSchema,
	pickStricterSpendLimit,
} from "./spendLimit.js";
import { type DbUsageAlert, DbUsageAlertSchema } from "./usageAlert.js";
import {
	type DbUsageLimit,
	DbUsageLimitSchema,
	pickStricterUsageLimit,
	usageLimitFilterKey,
} from "./usageLimit.js";

export const BILLING_CONTROL_KEYS = [
	"auto_topups",
	"spend_limits",
	"usage_limits",
	"usage_alerts",
	"overage_allowed",
] as const;

export type BillingControlKey = (typeof BILLING_CONTROL_KEYS)[number];

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

/**
 * Customer create/update params only. `count` is runtime state written to
 * `auto_topup_limit_states` and must never be persisted on `customers.auto_topups`
 * / `products.auto_topups` JSONB — strip via `stripAutoTopupCountsForStorage`.
 */
export const AutoTopupPurchaseLimitParamsSchema =
	AutoTopupPurchaseLimitSchema.extend({
		count: z.number().min(0).optional().meta({
			description:
				"Set the current window's consumed auto top-up count. Omit to leave runtime state unchanged.",
		}),
	});

export const AutoTopupSchema = z.object({
	feature_id: z.string().meta({
		description: "The ID of the feature (credit balance) to auto top-up.",
	}),
	enabled: z.boolean().default(false).meta({
		description: "Whether auto top-up is enabled.",
	}),
	threshold: z.number().meta({
		description:
			"When the balance drops below this threshold, an auto top-up will be purchased.",
	}),
	quantity: z.number().min(1).meta({
		description: "Amount of credits to add per auto top-up.",
	}),
	purchase_limit: AutoTopupPurchaseLimitSchema.optional().meta({
		description: "Optional rate limit to cap how often auto top-ups occur.",
	}),
	invoice_mode: z.boolean().optional().meta({
		description:
			"When true, auto top-up creates a send_invoice invoice instead of auto-charging.",
	}),
});

export const AutoTopupParamsSchema = AutoTopupSchema.extend({
	purchase_limit: AutoTopupPurchaseLimitParamsSchema.optional().meta({
		description:
			"Optional rate limit to cap how often auto top-ups occur. Pass count to set the current window's consumed top-ups.",
	}),
});

/**
 * Expanded purchase_limit shape that augments the static config with runtime
 * tracking state from `auto_topup_limit_states`. Only emitted on responses
 * when expand=billing_controls.auto_topups.purchase_limit is requested.
 *
 * When no `purchase_limit` is configured for the auto_topup, the original
 * config fields (interval, interval_count, limit) are returned as null and
 * only `count` / `next_reset_at` reflect runtime state.
 */
export const ExpandedPurchaseLimitSchema = z.object({
	interval: PurchaseLimitIntervalEnum.nullable().meta({
		description:
			"The time interval for the purchase limit window. Null when no purchase limit is configured.",
	}),
	interval_count: z.number().min(1).nullable().meta({
		description:
			"Number of intervals in the purchase limit window. Null when no purchase limit is configured.",
	}),
	limit: z.number().min(1).nullable().meta({
		description:
			"Maximum number of auto top-ups allowed within the interval. Null when no purchase limit is configured.",
	}),
	count: z.number().meta({
		description:
			"Number of auto top-ups already consumed in the current window.",
	}),
	next_reset_at: z.number().meta({
		description:
			"Unix ms timestamp when the current purchase window ends and the count resets.",
	}),
});

/**
 * Response-only variant of AutoTopupSchema. The `purchase_limit` field can be
 * either the static config shape (default) or the expanded runtime shape (when
 * the corresponding expand path is requested). Input/params schemas remain
 * strict — see `CustomerBillingControlsParamsSchema`.
 */
export const AutoTopupResponseSchema = AutoTopupSchema.extend({
	// Expanded first: its required count/next_reset_at would otherwise be
	// silently stripped by the laxer static member on re-parse.
	purchase_limit: z
		.union([ExpandedPurchaseLimitSchema, AutoTopupPurchaseLimitSchema])
		.optional()
		.meta({
			description:
				"Optional rate limit to cap how often auto top-ups occur. Expand billing_controls.auto_topups.purchase_limit for a count of top ups and the next_reset_at.",
		}),
});

export const CustomerBillingControlsSchema = z.object({
	auto_topups: z.array(AutoTopupSchema).optional().meta({
		description: "List of auto top-up configurations per feature.",
	}),
	spend_limits: z.array(DbSpendLimitSchema).optional().meta({
		description:
			"List of overage spend limits per feature (caps overage spend).",
	}),
	usage_limits: z.array(DbUsageLimitSchema).optional().meta({
		description:
			"List of hard usage caps per feature (max units per interval).",
	}),
	usage_alerts: z.array(DbUsageAlertSchema).optional().meta({
		description: "List of usage alert configurations per feature.",
	}),
	overage_allowed: z.array(DbOverageAllowedSchema).optional().meta({
		description:
			"List of overage allowed controls per feature. When enabled, usage can exceed balance.",
	}),
});

export const DbBillingControlsSchema = z.object({
	auto_topups: z.array(AutoTopupSchema).nullish(),
	spend_limits: z.array(DbSpendLimitSchema).nullish(),
	usage_limits: z.array(DbUsageLimitSchema).nullish(),
	usage_alerts: z.array(DbUsageAlertSchema).nullish(),
	overage_allowed: z.array(DbOverageAllowedSchema).nullish(),
});

export type AutoTopupPurchaseLimit = z.infer<
	typeof AutoTopupPurchaseLimitSchema
>;
export type AutoTopupPurchaseLimitParams = z.input<
	typeof AutoTopupPurchaseLimitParamsSchema
>;
export type ExpandedPurchaseLimit = z.infer<typeof ExpandedPurchaseLimitSchema>;
export type AutoTopup = z.infer<typeof AutoTopupSchema>;
export type AutoTopupParams = z.input<typeof AutoTopupParamsSchema>;
export type AutoTopupResponse = z.infer<typeof AutoTopupResponseSchema>;
export type CustomerBillingControls = z.infer<
	typeof CustomerBillingControlsSchema
>;
export type DbBillingControls = z.infer<typeof DbBillingControlsSchema>;

/** Strip runtime `count` before persisting auto_topups JSONB. */
export const stripAutoTopupCountsForStorage = (
	autoTopups: AutoTopupParams[] | AutoTopup[] | null | undefined,
): AutoTopup[] | null | undefined => {
	if (autoTopups == null) return autoTopups;

	return autoTopups.map((topup) =>
		AutoTopupSchema.parse({
			...topup,
			purchase_limit: topup.purchase_limit
				? {
						interval: topup.purchase_limit.interval,
						interval_count: topup.purchase_limit.interval_count ?? 1,
						limit: topup.purchase_limit.limit,
					}
				: undefined,
		}),
	);
};

export const pickBillingControlColumns = (
	source: Partial<DbBillingControls> | null | undefined,
): Partial<DbBillingControls> => {
	if (!source) return {};

	const picked = Object.fromEntries(
		BILLING_CONTROL_KEYS.flatMap((key) =>
			source[key] === undefined ? [] : [[key, source[key]]],
		),
	) as Partial<DbBillingControls>;

	if (picked.auto_topups !== undefined) {
		picked.auto_topups = stripAutoTopupCountsForStorage(
			picked.auto_topups as AutoTopupParams[] | null | undefined,
		);
	}

	return picked;
};

export const billingControlsFromColumns = (
	source: Partial<DbBillingControls> | null | undefined,
): CustomerBillingControls => {
	if (!source) return {};

	return Object.fromEntries(
		BILLING_CONTROL_KEYS.flatMap((key) =>
			source[key] == null ? [] : [[key, source[key]]],
		),
	) as CustomerBillingControls;
};

/** Canonical form for change detection: skip_overage_billing false ≡ unset. */
export const normalizeBillingControlsForCompare = (
	billingControls: CustomerBillingControls | null | undefined,
): CustomerBillingControls | undefined => {
	if (!billingControls?.spend_limits) return billingControls ?? undefined;

	return {
		...billingControls,
		spend_limits: billingControls.spend_limits.map((spendLimit) => {
			if (spendLimit.skip_overage_billing === true) return spendLimit;
			const { skip_overage_billing: _dropped, ...rest } = spendLimit;
			return rest;
		}),
	};
};

export const mergeBillingControls = (
	current: CustomerBillingControls | null | undefined,
	patch: CustomerBillingControls | null | undefined,
): CustomerBillingControls | undefined => {
	if (!patch) return current ?? undefined;

	return billingControlsFromColumns({
		...(current ?? {}),
		...pickBillingControlColumns(patch),
	});
};

export const CustomerBillingControlsParamsSchema =
	CustomerBillingControlsSchema.extend({
		auto_topups: z.array(AutoTopupParamsSchema).optional().meta({
			description: "List of auto top-up configurations per feature.",
		}),
	}).check((ctx) => {
		const billingControls = ctx.value;
		const spendLimitFeatureIds = new Set<string>();

		for (const [index, spendLimit] of (
			billingControls.spend_limits ?? []
		).entries()) {
			if (!spendLimit.feature_id) {
				continue;
			}

			if (spendLimitFeatureIds.has(spendLimit.feature_id)) {
				ctx.issues.push({
					code: "custom",
					message: "Only one spend limit entry is allowed per feature_id",
					input: spendLimit.feature_id,
					path: ["spend_limits", index, "feature_id"],
				});
				return;
			}

			spendLimitFeatureIds.add(spendLimit.feature_id);
		}

		const usageLimitIdentities = new Set<string>();

		for (const [index, usageLimit] of (
			billingControls.usage_limits ?? []
		).entries()) {
			const identity = `${usageLimit.feature_id}|${usageLimitFilterKey(usageLimit.filter)}`;
			if (usageLimitIdentities.has(identity)) {
				ctx.issues.push({
					code: "custom",
					message:
						"Only one usage limit entry is allowed per feature_id and filter",
					input: usageLimit.feature_id,
					path: ["usage_limits", index, "feature_id"],
				});
				return;
			}

			usageLimitIdentities.add(identity);
		}

		const overageAllowedFeatureIds = new Set<string>();

		for (const [index, overageAllowed] of (
			billingControls.overage_allowed ?? []
		).entries()) {
			if (overageAllowedFeatureIds.has(overageAllowed.feature_id)) {
				ctx.issues.push({
					code: "custom",
					message: "Only one overage_allowed entry is allowed per feature_id",
					input: overageAllowed.feature_id,
					path: ["overage_allowed", index, "feature_id"],
				});
				return;
			}

			overageAllowedFeatureIds.add(overageAllowed.feature_id);
		}
	});

export type CustomerBillingControlsParams = z.input<
	typeof CustomerBillingControlsParamsSchema
>;

export type {
	DbOverageAllowed,
	DbSpendLimit,
	DbUsageAlert,
	DbUsageLimit,
	EntityBillingControls,
	EntityBillingControlsParams,
};
export {
	DbOverageAllowedSchema,
	DbSpendLimitSchema,
	DbUsageAlertSchema,
	DbUsageLimitSchema,
	EntityBillingControlsSchema,
	pickStricterOverageAllowed,
	pickStricterSpendLimit,
	pickStricterUsageLimit,
};
export {
	USAGE_LIMIT_FILTER_MAX_KEY_LENGTH,
	USAGE_LIMIT_FILTER_MAX_KEYS,
	USAGE_LIMIT_FILTER_MAX_VALUE_LENGTH,
	type UsageLimitFilter,
	UsageLimitFilterSchema,
	usageLimitFilterKey,
	usageLimitFilterMatchesProperties,
} from "./usageLimit.js";
