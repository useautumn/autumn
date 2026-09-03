/**
 * `processors.stripe` on a catalog price states the Stripe price it bills as.
 * Omitting the key keeps whatever the row is mapped to; stating `null` unlinks
 * it. Presence in the body is the signal — a normal edit never sends the key.
 *
 * Red (before):  `price_id` was a bare string and `stripe` was `.optional()`,
 *                so an unlink could not be expressed; and every mapper
 *                optional-chained a null straight to undefined, so the planner
 *                saw the same thing a plain edit sends and left the row in
 *                `same` with its old Stripe id.
 * Green (after): a stated null lands the row in `updated` with the slot
 *                nulled, and carry-forward no longer refills it. An omitted
 *                key still leaves a mapped price exactly as it was.
 */

import { describe, expect, test } from "bun:test";
import {
	AppEnv,
	BillingInterval,
	BillingMethod,
	BillWhen,
	EntInterval,
	FeatureUsageType,
	type Price,
	ResetInterval,
	type UsagePriceConfig,
} from "@autumn/shared";
import {
	type UpdateCatalogPlanParamsInput,
	UpdateCatalogPlanParamsSchema,
} from "@autumn/shared/api/catalogV2/planUpdate/params/catalogPlanParams";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { entitlements } from "@tests/utils/fixtures/db/entitlements";
import { features } from "@tests/utils/fixtures/db/features";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import {
	computeEntitlementPricesPlan,
	type EntitlementPricesPlan,
} from "@/internal/products/actions/computeEntitlementPricesPlan";

const BASE_STRIPE_PRICE_ID = "price_base_mapped";
const USAGE_STRIPE_PRICE_ID = "price_usage_mapped";
const PREPAID_STRIPE_PRICE_ID = "price_prepaid_mapped";

const messagesFeature = features.create({
	id: "messages",
	internalId: "feat_internal_messages",
	name: "Messages",
	config: { usage_type: FeatureUsageType.Single },
});

const product = { ...products.create({ id: "pro" }), env: AppEnv.Sandbox };

const ctx = contexts.create({
	features: [messagesFeature],
	org: {
		id: "org_test",
		name: "Test Organization",
		slug: "test-org",
		default_currency: "usd",
		stripe_account_id: "acct_test",
		config: { multi_currency: false },
	} as never,
});

const currentEntitlement = entitlements.buildWithFeature({
	id: "ent_messages",
	internal_feature_id: messagesFeature.internal_id,
	feature_id: messagesFeature.id,
	feature: messagesFeature,
	allowance: 100,
	interval: EntInterval.Month,
});

/** A mapped base price: fixed prices bill from the v1 slot. */
const currentBasePrice = prices.buildFixed({
	overrides: { id: "pr_base" },
	configOverrides: { amount: 50, stripe_price_id: BASE_STRIPE_PRICE_ID },
});

/** A mapped usage price: also the v1 slot. */
const currentUsagePrice = prices.buildUsage({
	overrides: { id: "pr_usage", entitlement_id: "ent_messages" },
	configOverrides: { stripe_price_id: USAGE_STRIPE_PRICE_ID },
});

/** A mapped prepaid price: prepaid bills from the v2 slot. */
const currentPrepaidPrice = prices.buildUsage({
	overrides: {
		id: "pr_prepaid",
		entitlement_id: "ent_messages",
		proration_config: {
			on_increase: "prorate_immediately",
			on_decrease: "prorate_immediately",
		} as never,
	},
	configOverrides: {
		bill_when: BillWhen.StartOfPeriod,
		usage_tiers: [{ to: "inf", amount: 10 }],
		stripe_price_id: null,
		stripe_prepaid_price_v2_id: PREPAID_STRIPE_PRICE_ID,
	},
});

type StatedProcessors = { stripe: { price_id: string } | null };

const basePriceParams = (processors?: StatedProcessors) => ({
	amount: 50,
	interval: BillingInterval.Month,
	...(processors ? { processors } : {}),
});

const usageItemParams = (processors?: StatedProcessors) => ({
	feature_id: "messages",
	included: 100,
	reset: { interval: ResetInterval.Month },
	price: {
		amount: 1,
		interval: BillingInterval.Month,
		billing_units: 1,
		billing_method: BillingMethod.UsageBased,
		...(processors ? { processors } : {}),
	},
});

const prepaidItemParams = (processors?: StatedProcessors) => ({
	feature_id: "messages",
	included: 100,
	reset: { interval: ResetInterval.Month },
	price: {
		amount: 10,
		interval: BillingInterval.Month,
		billing_units: 1,
		billing_method: BillingMethod.Prepaid,
		...(processors ? { processors } : {}),
	},
});

/** Runs the wire payload through the catalog schema, as the real path does. */
const planFor = ({
	payload,
	currentPrices,
}: {
	payload: Omit<UpdateCatalogPlanParamsInput, "plan_id">;
	currentPrices: Price[];
}): EntitlementPricesPlan => {
	const parsed = UpdateCatalogPlanParamsSchema.parse({
		plan_id: "pro",
		...payload,
	});

	return computeEntitlementPricesPlan({
		ctx,
		params: {
			mode: { type: "update", protectReferencedRows: false },
			product,
			customize: {
				...(parsed.price !== undefined ? { price: parsed.price } : {}),
				...(parsed.items !== undefined ? { items: parsed.items } : {}),
			},
			currentRows: {
				prices: currentPrices,
				entitlements: [currentEntitlement],
			},
		},
	});
};

const slotsOf = ({ price }: { price: Price }) => {
	const config = price.config as UsagePriceConfig;
	return {
		stripe_price_id: config.stripe_price_id ?? null,
		stripe_prepaid_price_v2_id: config.stripe_prepaid_price_v2_id ?? null,
	};
};

const bucketOf = ({
	plan,
	priceId,
}: {
	plan: EntitlementPricesPlan;
	priceId: string;
}) =>
	(["new", "updated", "same", "deleted", "retired"] as const).find((bucket) =>
		plan.prices[bucket].some((price) => price.id === priceId),
	);

const plannedPrice = ({
	plan,
	priceId,
}: {
	plan: EntitlementPricesPlan;
	priceId: string;
}): Price => {
	const price = plan.projected?.prices.find((entry) => entry.id === priceId);
	if (!price)
		throw new Error(`price ${priceId} missing from the projected plan`);
	return price;
};

describe("stated null unlinks a price's Stripe mapping", () => {
	test("base price — null clears the v1 slot and the row is written", () => {
		const plan = planFor({
			payload: { price: basePriceParams({ stripe: null }), items: [] },
			currentPrices: [currentBasePrice],
		});

		expect(bucketOf({ plan, priceId: "pr_base" })).toBe("updated");
		expect(
			slotsOf({ price: plannedPrice({ plan, priceId: "pr_base" }) }),
		).toEqual({
			stripe_price_id: null,
			stripe_prepaid_price_v2_id: null,
		});
	});

	test("usage price — null clears the v1 slot", () => {
		const plan = planFor({
			payload: { items: [usageItemParams({ stripe: null })] },
			currentPrices: [currentUsagePrice],
		});

		expect(bucketOf({ plan, priceId: "pr_usage" })).toBe("updated");
		expect(
			slotsOf({ price: plannedPrice({ plan, priceId: "pr_usage" }) }),
		).toEqual({
			stripe_price_id: null,
			stripe_prepaid_price_v2_id: null,
		});
	});

	test("prepaid price — null clears the v2 slot it bills from", () => {
		const plan = planFor({
			payload: { items: [prepaidItemParams({ stripe: null })] },
			currentPrices: [currentPrepaidPrice],
		});

		expect(bucketOf({ plan, priceId: "pr_prepaid" })).toBe("updated");
		expect(
			slotsOf({ price: plannedPrice({ plan, priceId: "pr_prepaid" }) }),
		).toEqual({
			stripe_price_id: null,
			stripe_prepaid_price_v2_id: null,
		});
	});
});

describe("an omitted processors key is not an unlink", () => {
	test("a plain edit of every lane leaves each mapping exactly as it was", () => {
		const v1Plan = planFor({
			payload: { price: basePriceParams(), items: [usageItemParams()] },
			currentPrices: [currentBasePrice, currentUsagePrice],
		});

		expect(bucketOf({ plan: v1Plan, priceId: "pr_base" })).toBe("same");
		expect(bucketOf({ plan: v1Plan, priceId: "pr_usage" })).toBe("same");
		expect(
			slotsOf({ price: plannedPrice({ plan: v1Plan, priceId: "pr_base" }) })
				.stripe_price_id,
		).toBe(BASE_STRIPE_PRICE_ID);
		expect(
			slotsOf({ price: plannedPrice({ plan: v1Plan, priceId: "pr_usage" }) })
				.stripe_price_id,
		).toBe(USAGE_STRIPE_PRICE_ID);

		const prepaidPlan = planFor({
			payload: { items: [prepaidItemParams()] },
			currentPrices: [currentPrepaidPrice],
		});

		expect(bucketOf({ plan: prepaidPlan, priceId: "pr_prepaid" })).toBe("same");
		expect(
			slotsOf({
				price: plannedPrice({ plan: prepaidPlan, priceId: "pr_prepaid" }),
			}).stripe_prepaid_price_v2_id,
		).toBe(PREPAID_STRIPE_PRICE_ID);
	});

	test("a restated id still re-points the mapping", () => {
		const plan = planFor({
			payload: {
				price: basePriceParams({ stripe: { price_id: "price_base_restated" } }),
				items: [
					prepaidItemParams({ stripe: { price_id: "price_prepaid_restated" } }),
				],
			},
			currentPrices: [currentBasePrice, currentPrepaidPrice],
		});

		expect(bucketOf({ plan, priceId: "pr_base" })).toBe("updated");
		expect(
			slotsOf({ price: plannedPrice({ plan, priceId: "pr_base" }) })
				.stripe_price_id,
		).toBe("price_base_restated");

		expect(bucketOf({ plan, priceId: "pr_prepaid" })).toBe("updated");
		expect(
			slotsOf({ price: plannedPrice({ plan, priceId: "pr_prepaid" }) })
				.stripe_prepaid_price_v2_id,
		).toBe("price_prepaid_restated");
	});
});
