import { ApiFeatureOverrideSchema } from "@api/features/apiFeatureOverride";
import {
	AdditionalCurrencyPriceArraySchema,
	ApiUsageTierWithCurrenciesSchema,
	additionalCurrencyPlanItemIssues,
} from "@api/products/components/additionalCurrencies";
import { BillingMethod } from "@api/products/components/billingMethod";
import { RolloverExpiryDurationType } from "@models/productModels/durationTypes/rolloverExpiryDurationType";
import { BillingInterval } from "@models/productModels/intervals/billingInterval";
import { ResetInterval } from "@models/productModels/intervals/resetInterval";
import { TierBehavior } from "@models/productModels/priceModels/priceConfig/usagePriceConfig";
import {
	OnDecrease,
	OnIncrease,
} from "@models/productV2Models/productItemModels/productItemEnums";
import { z } from "zod/v4";

export const IncludedUsageParamsSchema = z.number().max(10_000_000_000_000, {
	error:
		"Included usage cannot exceed 10 trillion; use unlimited usage instead",
});

/**
 * The `price` sub-object, without any processor mapping. Adoption of an
 * existing Stripe price is deliberately scoped to the catalog path, so the
 * `processors` field is added by `CatalogPlanItemParamsV1Schema` instead of
 * living here — attach/customize/migration paths must not be able to state one.
 */
export const PlanItemPriceParamsSchema = z.object({
	stripe_price_id: z
		.string()
		.nullish()
		.transform((value) => value ?? undefined)
		.meta({
			description:
				"Stripe price id this feature price is billed under. Set by sync flows to preserve an existing Stripe price.",
			internal: true,
		})
		.optional(),
	amount: z.number().optional().meta({
		description:
			"Price per billing_units after included usage. Either 'amount' or 'tiers' is required.",
	}),
	additional_currencies: AdditionalCurrencyPriceArraySchema.optional().meta({
		description:
			"Amounts in additional currencies for this flat price. The base 'amount' is in the org's default currency. Only valid with 'amount', not 'tiers'.",
	}),
	tiers: z.array(ApiUsageTierWithCurrenciesSchema).optional().meta({
		description: "Tiered pricing.  Either 'amount' or 'tiers' is required.",
	}),
	tier_behavior: z.enum(TierBehavior).optional(),

	interval: z.enum(BillingInterval).meta({
		description:
			"Billing interval. For consumable features, should match reset.interval.",
	}),
	interval_count: z.number().default(1).optional().meta({
		description: "Number of intervals per billing cycle. Defaults to 1.",
	}),

	billing_units: z.number().default(1).optional().meta({
		description:
			"Units per price increment. Usage is rounded UP when billed (e.g. billing_units=100 means 101 rounds to 200).",
	}),
	billing_method: z.enum(BillingMethod).meta({
		description:
			"'prepaid' for upfront payment (seats), 'usage_based' for pay-as-you-go.",
	}),
	max_purchase: z.number().nullish().meta({
		description:
			"Max units purchasable beyond included. E.g. included=100, max_purchase=300 allows 400 total. Null for no limit.",
	}),
});

export const PLAN_ITEM_PRICE_DESCRIPTION =
	"Pricing for usage beyond included units. Omit for free features.";

/**
 * Field shape only — no cross-field checks and no `.meta()` title. The catalog
 * variant rebuilds from this so both schemas share one definition; run the
 * checks through `planItemParamsIssues`.
 */
export const PlanItemParamsObjectSchema = z.object({
	feature_id: z.string().meta({
		description: "The ID of the feature to configure.",
	}),
	included: IncludedUsageParamsSchema.optional().meta({
		description:
			"Number of free units included. Balance resets to this each interval for consumable features.",
	}),
	unlimited: z.boolean().optional().meta({
		description: "If true, customer has unlimited access to this feature.",
	}),
	pooled: z.boolean().default(false).optional().meta({
		description:
			"Whether entity-level grants contribute to a shared customer balance.",
	}),

	reset: z
		.object({
			interval: z.enum(ResetInterval).meta({
				description:
					"Interval at which balance resets (e.g. 'month', 'year'). For consumable features only.",
			}),
			interval_count: z.number().optional().meta({
				description: "Number of intervals between resets. Defaults to 1.",
			}),
		})
		.optional()
		.meta({
			description:
				"Reset configuration for consumable features. Omit for non-consumable features like seats.",
		}),

	price: PlanItemPriceParamsSchema.optional().meta({
		description: PLAN_ITEM_PRICE_DESCRIPTION,
	}),

	proration: z
		.object({
			on_increase: z.enum(OnIncrease).meta({
				description: "Billing behavior when quantity increases mid-cycle.",
			}),
			on_decrease: z.enum(OnDecrease).meta({
				description: "Credit behavior when quantity decreases mid-cycle.",
			}),
		})
		.optional()
		.meta({
			description:
				"Proration settings for prepaid features. Controls mid-cycle quantity change billing.",
		}),

	rollover: z
		.object({
			max: z.number().optional().meta({
				description: "Max rollover units. Omit for unlimited rollover.",
			}),
			max_percentage: z.number().optional().meta({
				description:
					"Maximum rollover as a percentage (0-100) of included + prepaid grant. Mutually exclusive with max.",
			}),
			expiry_duration_type: z.enum(RolloverExpiryDurationType).meta({
				description: "When rolled over units expire.",
			}),
			expiry_duration_length: z.number().optional().meta({
				description: "Number of periods before expiry.",
			}),
		})
		.optional()
		.meta({
			description:
				"Rollover config for unused units. If set, unused included units carry over.",
		}),

	feature_override: ApiFeatureOverrideSchema.optional().meta({
		description:
			"Overrides fields of this item's feature for customers on this plan (e.g. a credit system's credit_schema).",
	}),

	entity_feature_id: z.string().optional().meta({
		internal: true,
	}),

	entitlement_id: z.string().optional().meta({
		internal: true,
	}),
	price_id: z.string().optional().meta({
		internal: true,
	}),
});

type PlanItemParamsCheckValue = z.infer<typeof PlanItemParamsObjectSchema>;

/**
 * Cross-field invariants for a plan item. Shared by the generic and the catalog
 * item schemas so the rules can't drift; returns issues and lets each schema
 * push them.
 */
export const planItemParamsIssues = (
	value: PlanItemParamsCheckValue,
): { message: string; input: unknown }[] => {
	const issues: { message: string; input: unknown }[] = [];

	const resetInterval = value.reset?.interval;
	const priceInterval = value.price?.interval;
	const resetIntervalCount = value.reset?.interval_count ?? 1;
	const priceIntervalCount = value.price?.interval_count ?? 1;
	const hasDifferentResetAndPriceInterval =
		!!resetInterval &&
		!!priceInterval &&
		(String(resetInterval) !== String(priceInterval) ||
			resetIntervalCount !== priceIntervalCount);

	if (
		hasDifferentResetAndPriceInterval &&
		value.price?.billing_method !== BillingMethod.Prepaid
	) {
		issues.push({
			message:
				"reset.interval and price.interval can only differ for prepaid prices.",
			input: value,
		});
	}

	// At a minimum, if price is present, at least amount OR tiers must be defined, and not both
	if (value.price) {
		const { amount, tiers } = value.price;

		if (
			value.proration &&
			value.price.billing_method === BillingMethod.UsageBased
		) {
			issues.push({
				message: "proration is only supported for prepaid features.",
				input: value.proration,
			});
		}

		const hasAmount = typeof amount === "number";
		const hasTiers = Array.isArray(tiers) && tiers.length > 0;

		if (!(hasAmount || hasTiers)) {
			issues.push({
				message:
					"If 'price' is present, either 'amount' or 'tiers' must be defined.",
				input: value.price,
			});
		} else if (hasAmount && hasTiers) {
			issues.push({
				message: "'amount' and 'tiers' cannot both be defined in 'price'.",
				input: value.price,
			});
		}
	}

	if (value.price?.tiers) {
		const hasFlatAmount = value.price.tiers.some(
			(t) => t.flat_amount && t.flat_amount > 0,
		);

		if (
			hasFlatAmount &&
			value.price.tier_behavior !== TierBehavior.VolumeBased
		) {
			issues.push({
				message:
					"flat_amount on tiers is only supported for volume-based pricing.",
				input: value.price,
			});
		}

		if (hasFlatAmount && value.price.tiers.length <= 1) {
			issues.push({
				message: "flat_amount is not supported on single-tier pricing.",
				input: value.price,
			});
		}

		if (
			value.price.tiers.some((t) => t.flat_amount != null && t.flat_amount < 0)
		) {
			issues.push({
				message: "flat_amount must be 0 or greater.",
				input: value.price,
			});
		}

		if (
			value.price?.tier_behavior === TierBehavior.VolumeBased &&
			value.price?.billing_method !== BillingMethod.Prepaid
		) {
			issues.push({
				message: "volume-based pricing is only supported for prepaid features.",
				input: value.price,
			});
		}

		if (value.price?.tiers.length === 0) {
			issues.push({ message: "tiers cannot be empty.", input: value.price });
		} else if (
			value.included &&
			typeof value.price?.tiers[0].to === "number" &&
			value.price?.tiers[0].to <= value.included
		) {
			issues.push({
				message: "tiers[0].to must be greater than included.",
				input: value.price,
			});
		}
	}

	for (const message of additionalCurrencyPlanItemIssues(value.price)) {
		issues.push({ message, input: value.price });
	}

	return issues;
};

export const CreatePlanItemParamsV1Schema = PlanItemParamsObjectSchema.check(
	(ctx) => {
		for (const { message, input } of planItemParamsIssues(ctx.value)) {
			ctx.issues.push({ code: "custom", message, input });
		}
	},
).meta({
	title: "PlanItem",
	description:
		"Configuration for a feature item in a plan, including usage limits, pricing, and rollover settings.",
});
export type CreatePlanItemParamsV1 = z.infer<
	typeof CreatePlanItemParamsV1Schema
>;
export type CreatePlanItemParamsV1Input = z.input<
	typeof CreatePlanItemParamsV1Schema
>;
