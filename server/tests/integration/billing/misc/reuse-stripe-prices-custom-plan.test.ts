/**
 * Custom plans reuse the base plan's Stripe resources where possible.
 *
 * When a customer attaches a plan with `customize.items` (or `customize.price`),
 * a new `is_custom: true` price row is written for each affected price. The
 * carry-forward path in handleNewProductItems.carryForwardStripeResources
 * (which calls copyStripeResourcesToMatchingPrice) MUST populate the new row's
 * `stripe_*_id` fields from the matching catalog price so we don't mint
 * duplicate Stripe Price objects.
 *
 * Contract under test:
 *   - Adding an unrelated boolean entitlement (dashboard) keeps every existing
 *     price's Stripe IDs intact.
 *   - Same for the paid feature shapes prepaid / consumable / allocated.
 *   - Negative: swapping prepaid → consumable on the same feature does NOT
 *     reuse stripe_price_id (different price.config.type / billing_method).
 *   - Negative: changing the price amount on a prepaid item does NOT reuse
 *     stripe_price_id (config differs → pricesAreSame=false → reuse level
 *     drops below "full").
 *   - Negative: changing tier amounts on a tiered prepaid item does NOT reuse
 *     stripe_price_id.
 *
 * Implementation surface:
 *   server/src/internal/products/product-items/productItemUtils/
 *     handleNewProductItems.ts — calls carryForwardStripeResources before
 *     persisting new prices.
 *   shared/utils/productUtils/priceUtils/match/
 *     copyStripeResourcesToMatchingPrice.ts + getPriceStripeReuseLevel.ts —
 *     the actual matching + copy logic.
 *   shared/utils/productUtils/priceUtils/match/priceStripeObjectsMatch.ts —
 *     boolean predicate used by the test helpers.
 */

import { test } from "bun:test";
import {
	type AttachParamsV1Input,
	BillingInterval,
	BillingMethod,
	OnDecrease,
	OnIncrease,
	RolloverExpiryDurationType,
	TierBehavior,
	TierInfinite,
} from "@autumn/shared";
import {
	expectAllStripeIdsReused,
	expectStripePriceIdNotReused,
	loadCustomerAndCatalogPrices,
} from "@tests/integration/billing/misc/utils/findCatalogAndCustomPrices";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: custom plan adds a boolean entitlement, base price reused
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("custom plan: add boolean entitlement → base price Stripe IDs reused")}`, async () => {
	const customerId = "reuse-custom-boolean";

	const proPlan = products.pro({
		id: "pro-reuse-boolean",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [proPlan] }),
		],
		actions: [],
	});

	const params: AttachParamsV1Input = {
		customer_id: customerId,
		plan_id: proPlan.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 20 }),
			items: [
				itemsV2.monthlyMessages({ included: 100 }),
				itemsV2.dashboard(),
			],
		},
	};

	await autumnV2_2.billing.attach<AttachParamsV1Input>(params);

	const { pairs } = await loadCustomerAndCatalogPrices({
		ctx,
		customerId,
		catalogProductId: proPlan.id,
	});

	expectAllStripeIdsReused({ pairs });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: custom plan keeps prepaid/consumable/allocated items → all reused
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("custom plan: paid feature shapes unchanged → all Stripe IDs reused")}`, async () => {
	const customerId = "reuse-custom-paid";

	const proPlan = products.pro({
		id: "pro-reuse-paid",
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.prepaidUsers({ billingUnits: 1 }),
			items.consumableWords({ includedUsage: 0 }),
			items.allocatedWorkflows({ includedUsage: 0 }),
		],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [proPlan] }),
		],
		actions: [],
	});

	const params: AttachParamsV1Input = {
		customer_id: customerId,
		plan_id: proPlan.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 20 }),
			items: [
				itemsV2.monthlyMessages({ included: 100 }),
				itemsV2.prepaidUsers({ amount: 10, billingUnits: 1 }),
				itemsV2.consumableWords({ amount: 0.05 }),
				itemsV2.allocatedWorkflows({ amount: 10 }),
				itemsV2.dashboard(),
			],
		},
	};

	await autumnV2_2.billing.attach<AttachParamsV1Input>(params);

	const { pairs } = await loadCustomerAndCatalogPrices({
		ctx,
		customerId,
		catalogProductId: proPlan.id,
	});

	expectAllStripeIdsReused({ pairs });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3 (negative): swap prepaid → consumable on same feature → no reuse
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("custom plan: prepaid → consumable on same feature → stripe_price_id NOT reused")}`, async () => {
	const customerId = "reuse-custom-prepaid-to-consumable";

	const proPlan = products.pro({
		id: "pro-reuse-prepaid-to-consumable",
		items: [items.prepaidMessages({ includedUsage: 0 })],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [proPlan] }),
		],
		actions: [],
	});

	const params: AttachParamsV1Input = {
		customer_id: customerId,
		plan_id: proPlan.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 20 }),
			items: [itemsV2.consumableMessages({ amount: 0.5 })],
		},
	};

	await autumnV2_2.billing.attach<AttachParamsV1Input>(params);

	const { pairs, catalogPrices, customerPrices } = await loadCustomerAndCatalogPrices({
		ctx,
		customerId,
		catalogProductId: proPlan.id,
	});

	expectStripePriceIdNotReused({
		pairs,
		featureId: TestFeature.Messages,
		catalogPrices,
		customerPrices,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4 (negative): change prepaid price amount → stripe_price_id not reused
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("custom plan: prepaid amount change → stripe_price_id NOT reused")}`, async () => {
	const customerId = "reuse-custom-prepaid-amount";

	const proPlan = products.pro({
		id: "pro-reuse-prepaid-amount",
		items: [items.prepaidMessages({ includedUsage: 0 })],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [proPlan] }),
		],
		actions: [],
	});

	const params: AttachParamsV1Input = {
		customer_id: customerId,
		plan_id: proPlan.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 20 }),
			items: [itemsV2.prepaidMessages({ amount: 25, billingUnits: 100 })],
		},
	};

	await autumnV2_2.billing.attach<AttachParamsV1Input>(params);

	const { pairs } = await loadCustomerAndCatalogPrices({
		ctx,
		customerId,
		catalogProductId: proPlan.id,
	});

	expectStripePriceIdNotReused({ pairs, featureId: TestFeature.Messages });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5 (negative): change tier amounts on tiered prepaid → not reused
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("custom plan: tier amount change → stripe_price_id NOT reused")}`, async () => {
	const customerId = "reuse-custom-tier";

	const proPlan = products.pro({
		id: "pro-reuse-tier",
		items: [items.tieredPrepaidMessages({ includedUsage: 0 })],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [proPlan] }),
		],
		actions: [],
	});

	const params: AttachParamsV1Input = {
		customer_id: customerId,
		plan_id: proPlan.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 20 }),
			items: [
				itemsV2.tieredPrepaidMessages({
					tiers: [
						{ to: 600, amount: 20 },
						{ to: TierInfinite, amount: 10 },
					],
				}),
			],
		},
	};

	await autumnV2_2.billing.attach<AttachParamsV1Input>(params);

	const { pairs } = await loadCustomerAndCatalogPrices({
		ctx,
		customerId,
		catalogProductId: proPlan.id,
	});

	expectStripePriceIdNotReused({ pairs, featureId: TestFeature.Messages });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6 (negative): graduated → volume tier_behavior → stripe_price_id not reused
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("custom plan: graduated → volume tier_behavior → stripe_price_id NOT reused")}`, async () => {
	const customerId = "reuse-custom-tier-behavior";

	const proPlan = products.pro({
		id: "pro-reuse-tier-behavior",
		items: [items.tieredPrepaidMessages({ includedUsage: 0 })],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [proPlan] }),
		],
		actions: [],
	});

	const params: AttachParamsV1Input = {
		customer_id: customerId,
		plan_id: proPlan.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 20 }),
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 0,
					price: {
						tiers: [
							{ to: 500, amount: 10 },
							{ to: TierInfinite, amount: 5 },
						],
						tier_behavior: TierBehavior.VolumeBased,
						interval: BillingInterval.Month,
						billing_method: BillingMethod.Prepaid,
						billing_units: 100,
					},
				},
			],
		},
	};

	await autumnV2_2.billing.attach<AttachParamsV1Input>(params);

	const { pairs } = await loadCustomerAndCatalogPrices({
		ctx,
		customerId,
		catalogProductId: proPlan.id,
	});

	expectStripePriceIdNotReused({ pairs, featureId: TestFeature.Messages });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7 (negative): add flat_amount to a tier → stripe_price_id not reused
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("custom plan: add flat_amount to tier → stripe_price_id NOT reused")}`, async () => {
	const customerId = "reuse-custom-flat-amount";

	const proPlan = products.pro({
		id: "pro-reuse-flat-amount",
		items: [items.volumePrepaidMessages({ includedUsage: 0 })],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [proPlan] }),
		],
		actions: [],
	});

	const params: AttachParamsV1Input = {
		customer_id: customerId,
		plan_id: proPlan.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 20 }),
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 0,
					price: {
						tiers: [
							{ to: 500, amount: 10, flat_amount: 100 },
							{ to: TierInfinite, amount: 5 },
						],
						tier_behavior: TierBehavior.VolumeBased,
						interval: BillingInterval.Month,
						billing_method: BillingMethod.Prepaid,
						billing_units: 100,
					},
				},
			],
		},
	};

	await autumnV2_2.billing.attach<AttachParamsV1Input>(params);

	const { pairs } = await loadCustomerAndCatalogPrices({
		ctx,
		customerId,
		catalogProductId: proPlan.id,
	});

	expectStripePriceIdNotReused({ pairs, featureId: TestFeature.Messages });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8 (negative): change proration_config on allocated → stripe_price_id not reused
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("custom plan: change proration_config on allocated → stripe_price_id NOT reused")}`, async () => {
	const customerId = "reuse-custom-proration";

	const proPlan = products.pro({
		id: "pro-reuse-proration",
		items: [items.allocatedWorkflows({ includedUsage: 0 })],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [proPlan] }),
		],
		actions: [],
	});

	const params: AttachParamsV1Input = {
		customer_id: customerId,
		plan_id: proPlan.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 20 }),
			items: [
				{
					feature_id: TestFeature.Workflows,
					included: 0,
					price: {
						amount: 10,
						interval: BillingInterval.Month,
						billing_method: BillingMethod.UsageBased,
						billing_units: 1,
					},
					proration: {
						on_increase: OnIncrease.ProrateImmediately,
						on_decrease: OnDecrease.Prorate,
					},
				},
			],
		},
	};

	await autumnV2_2.billing.attach<AttachParamsV1Input>(params);

	const { pairs } = await loadCustomerAndCatalogPrices({
		ctx,
		customerId,
		catalogProductId: proPlan.id,
	});

	expectStripePriceIdNotReused({ pairs, featureId: TestFeature.Workflows });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 9 (negative): change billing_units → stripe_price_id not reused
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("custom plan: change prepaid billing_units → stripe_price_id NOT reused")}`, async () => {
	const customerId = "reuse-custom-billing-units";

	const proPlan = products.pro({
		id: "pro-reuse-billing-units",
		items: [items.prepaidMessages({ includedUsage: 0, billingUnits: 100 })],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [proPlan] }),
		],
		actions: [],
	});

	const params: AttachParamsV1Input = {
		customer_id: customerId,
		plan_id: proPlan.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 20 }),
			items: [itemsV2.prepaidMessages({ amount: 10, billingUnits: 50 })],
		},
	};

	await autumnV2_2.billing.attach<AttachParamsV1Input>(params);

	const { pairs } = await loadCustomerAndCatalogPrices({
		ctx,
		customerId,
		catalogProductId: proPlan.id,
	});

	expectStripePriceIdNotReused({ pairs, featureId: TestFeature.Messages });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 10 (positive): change rollover config on ent (base price unaffected)
// Rollover lives on the entitlement. monthlyMessagesWithRollover has no price,
// so the only paid line on this plan is the $20 base — which has no paired ent
// and thus is unaffected by ent rollover diffs. Asserts the base price still
// reuses all Stripe IDs across the customize.
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("custom plan: change rollover config → base price Stripe IDs still reused")}`, async () => {
	const customerId = "reuse-custom-rollover";

	const proPlan = products.pro({
		id: "pro-reuse-rollover",
		items: [
			items.monthlyMessagesWithRollover({
				includedUsage: 200,
				rolloverConfig: {
					max: 100,
					length: 0,
					duration: RolloverExpiryDurationType.Forever,
				},
			}),
		],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [proPlan] }),
		],
		actions: [],
	});

	const params: AttachParamsV1Input = {
		customer_id: customerId,
		plan_id: proPlan.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 20 }),
			items: [
				{
					feature_id: TestFeature.Messages,
					included: 200,
					rollover: {
						max: 500,
						expiry_duration_type: RolloverExpiryDurationType.Forever,
						expiry_duration_length: 0,
					},
				},
			],
		},
	};

	await autumnV2_2.billing.attach<AttachParamsV1Input>(params);

	const { pairs } = await loadCustomerAndCatalogPrices({
		ctx,
		customerId,
		catalogProductId: proPlan.id,
	});

	expectAllStripeIdsReused({ pairs });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 11 (positive): prepaid + consumable pair on same feature → both reused
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("custom plan: prepaid + consumable pair on same feature → both Stripe IDs reused")}`, async () => {
	const customerId = "reuse-custom-pair";

	const proPlan = products.pro({
		id: "pro-reuse-pair",
		items: [
			items.prepaidMessages({ includedUsage: 0, billingUnits: 100 }),
			items.consumableMessages({ includedUsage: 0, price: 0.5 }),
		],
	});

	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [proPlan] }),
		],
		actions: [],
	});

	const params: AttachParamsV1Input = {
		customer_id: customerId,
		plan_id: proPlan.id,
		customize: {
			price: itemsV2.monthlyPrice({ amount: 20 }),
			items: [
				itemsV2.prepaidMessages({ amount: 10, billingUnits: 100 }),
				itemsV2.consumableMessages({ amount: 0.5 }),
				itemsV2.dashboard(),
			],
		},
	};

	await autumnV2_2.billing.attach<AttachParamsV1Input>(params);

	const { pairs } = await loadCustomerAndCatalogPrices({
		ctx,
		customerId,
		catalogProductId: proPlan.id,
	});

	expectAllStripeIdsReused({ pairs });
});
