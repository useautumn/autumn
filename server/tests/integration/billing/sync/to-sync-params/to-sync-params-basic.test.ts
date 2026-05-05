/**
 * subscriptionToSyncParams — basic detection cases
 *
 * Exercises the canonical "Stripe sub → SyncParamsV1" pipeline against a
 * variety of subscription shapes. Each test:
 *   1. Sets up an Autumn customer + a single Pro product
 *   2. Creates a Stripe subscription with specific items
 *   3. Calls `subscriptionToSyncParams` directly with the test ctx
 *   4. Asserts via `expectSyncParamsCorrect` + `expectSubscriptionMatchCorrect`
 *
 * NOTE: Cases 3, 4, 5 codify desired contract — they exercise
 * `feature_quantities` / custom-stripe-price-id propagation that may not be
 * fully wired through `subscriptionToSyncParams` yet. Failures here are the
 * spec for the next implementation pass.
 */

import { test } from "bun:test";
import { expectSubscriptionMatchCorrect } from "@tests/integration/billing/utils/sync/expectSubscriptionMatch";
import { expectSyncParamsCorrect } from "@tests/integration/billing/utils/sync/expectSyncParams";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { subscriptionToSyncParams } from "@/internal/billing/v2/actions/sync/subscriptionToSyncParams";
import { createStripeSubscriptionFromProduct } from "../utils/syncTestUtils";
import {
	createStripeFixedPriceUnderProduct,
	createStripeTieredPriceUnderProduct,
	fetchFullProduct,
	getBaseStripePriceId,
	getPrepaidStripeProductId,
	getProductStripeProductId,
	getStripeCustomerId,
} from "../utils/syncProductHelpers";

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 1: simple plan with base price, exact stripe_price_id match
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("to-sync-params: case 1 — base price exact match")}`, async () => {
	const customerId = "to-sync-params-1-base";
	const pro = products.pro({ id: "pro", items: [] });

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const subscription = await createStripeSubscriptionFromProduct({
		ctx,
		customerId,
		productId: pro.id,
	});

	const { match, params } = await subscriptionToSyncParams({
		ctx,
		customerId,
		subscription,
	});

	expectSyncParamsCorrect({
		params,
		customer_id: customerId,
		stripe_subscription_id: subscription.id,
		phases: [
			{
				starts_at: "now",
				plans: [{ plan_id: pro.id, quantity: 1, customize: null }],
			},
		],
	});

	expectSubscriptionMatchCorrect({
		match,
		currentPhase: {
			plans: [{ plan_id: pro.id, base_kind: "matched" }],
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 2: simple plan with custom base price under the same Stripe product
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("to-sync-params: case 2 — custom base price under same stripe product")}`, async () => {
	const customerId = "to-sync-params-2-custom-base";
	const pro = products.pro({ id: "pro", items: [] });

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const fullProduct = await fetchFullProduct({ ctx, productId: pro.id });
	const stripeProductId = getProductStripeProductId({ fullProduct });
	const stripeCustomerId = await getStripeCustomerId({ ctx, customerId });

	// Build a custom Stripe price ($50/mo) under Pro's Stripe product.
	const customPrice = await createStripeFixedPriceUnderProduct({
		ctx,
		stripeProductId,
		unitAmount: 5000,
	});

	const subscription = await ctx.stripeCli.subscriptions.create({
		customer: stripeCustomerId,
		items: [{ price: customPrice.id }],
	});

	const { match, params } = await subscriptionToSyncParams({
		ctx,
		customerId,
		subscription,
	});

	expectSyncParamsCorrect({
		params,
		customer_id: customerId,
		stripe_subscription_id: subscription.id,
		phases: [
			{
				starts_at: "now",
				plans: [
					{
						plan_id: pro.id,
						customize: {
							price: {
								amount: 50,
								interval: "month",
								stripe_price_id: customPrice.id,
							},
						},
					},
				],
			},
		],
	});

	expectSubscriptionMatchCorrect({
		match,
		currentPhase: {
			plans: [{ plan_id: pro.id, base_kind: "custom" }],
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 3: plan with prepaid messages; sub omits the prepaid item → quantity 0
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("to-sync-params: case 3 — prepaid messages initialized to quantity 0")}`, async () => {
	const customerId = "to-sync-params-3-prepaid-zero";
	const pro = products.pro({
		id: "pro",
		items: [items.prepaidMessages({ price: 10, billingUnits: 100 })],
	});

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// Build a sub that ONLY uses Pro's base price — omit the prepaid item.
	const fullProduct = await fetchFullProduct({ ctx, productId: pro.id });
	const baseStripePriceId = getBaseStripePriceId({ fullProduct });
	const stripeCustomerId = await getStripeCustomerId({ ctx, customerId });

	const subscription = await ctx.stripeCli.subscriptions.create({
		customer: stripeCustomerId,
		items: [{ price: baseStripePriceId }],
	});

	const { params } = await subscriptionToSyncParams({
		ctx,
		customerId,
		subscription,
	});

	expectSyncParamsCorrect({
		params,
		customer_id: customerId,
		stripe_subscription_id: subscription.id,
		phases: [
			{
				starts_at: "now",
				plans: [
					{
						plan_id: pro.id,
						customize: null,
						feature_quantities: [
							{ feature_id: TestFeature.Messages, quantity: 0 },
						],
					},
				],
			},
		],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 4: plan with prepaid messages; sub has base + custom fixed price
//         under prepaid Messages's stripe_product_id
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("to-sync-params: case 4 — custom fixed price under prepaid Messages stripe product")}`, async () => {
	const customerId = "to-sync-params-4-prepaid-custom-fixed";
	const pro = products.pro({
		id: "pro",
		items: [items.prepaidMessages({ price: 10, billingUnits: 100 })],
	});

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const fullProduct = await fetchFullProduct({ ctx, productId: pro.id });
	const baseStripePriceId = getBaseStripePriceId({ fullProduct });
	const prepaidStripeProductId = getPrepaidStripeProductId({ fullProduct });
	const stripeCustomerId = await getStripeCustomerId({ ctx, customerId });

	// Custom fixed Stripe price under the prepaid Messages product
	const customPrepaidPrice = await createStripeFixedPriceUnderProduct({
		ctx,
		stripeProductId: prepaidStripeProductId,
		unitAmount: 1500, // $15/mo (vs. Autumn's $10 default)
	});

	const subscription = await ctx.stripeCli.subscriptions.create({
		customer: stripeCustomerId,
		items: [{ price: baseStripePriceId }, { price: customPrepaidPrice.id }],
	});

	const { match, params } = await subscriptionToSyncParams({
		ctx,
		customerId,
		subscription,
	});

	expectSyncParamsCorrect({
		params,
		customer_id: customerId,
		stripe_subscription_id: subscription.id,
		phases: [
			{
				starts_at: "now",
				plans: [
					{
						plan_id: pro.id,
						feature_quantities: [
							{
								feature_id: TestFeature.Messages,
								stripe_price_id: customPrepaidPrice.id,
							},
						],
					},
				],
			},
		],
	});

	expectSubscriptionMatchCorrect({
		match,
		currentPhase: {
			plans: [{ plan_id: pro.id }],
			noUnmatchedItems: true,
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 5: plan with prepaid messages; sub has base + tiered Stripe price
//         under prepaid Messages's stripe_product_id
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("to-sync-params: case 5 — tiered price under prepaid Messages stripe product")}`, async () => {
	const customerId = "to-sync-params-5-prepaid-tiered";
	const pro = products.pro({
		id: "pro",
		items: [items.prepaidMessages({ price: 10, billingUnits: 100 })],
	});

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const fullProduct = await fetchFullProduct({ ctx, productId: pro.id });
	const baseStripePriceId = getBaseStripePriceId({ fullProduct });
	const prepaidStripeProductId = getPrepaidStripeProductId({ fullProduct });
	const stripeCustomerId = await getStripeCustomerId({ ctx, customerId });

	// Custom tiered Stripe price under the prepaid Messages product
	const customTieredPrice = await createStripeTieredPriceUnderProduct({
		ctx,
		stripeProductId: prepaidStripeProductId,
		tiersMode: "graduated",
		tiers: [
			{ up_to: 1000, unit_amount: 5 },
			{ up_to: "inf", unit_amount: 2 },
		],
	});

	const subscription = await ctx.stripeCli.subscriptions.create({
		customer: stripeCustomerId,
		items: [{ price: baseStripePriceId }, { price: customTieredPrice.id }],
	});

	const { match, params } = await subscriptionToSyncParams({
		ctx,
		customerId,
		subscription,
	});

	expectSyncParamsCorrect({
		params,
		customer_id: customerId,
		stripe_subscription_id: subscription.id,
		phases: [
			{
				starts_at: "now",
				plans: [
					{
						plan_id: pro.id,
						feature_quantities: [
							{
								feature_id: TestFeature.Messages,
								stripe_price_id: customTieredPrice.id,
							},
						],
					},
				],
			},
		],
	});

	expectSubscriptionMatchCorrect({
		match,
		currentPhase: {
			plans: [{ plan_id: pro.id }],
			noUnmatchedItems: true,
		},
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// CASE 6: Pro + add-on; add-on Stripe item has quantity 2
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("to-sync-params: case 6 — add-on with stripe quantity 2")}`, async () => {
	const customerId = "to-sync-params-6-addon-quantity";
	const pro = products.pro({ id: "pro", items: [] });
	const addOn = products.recurringAddOn({ id: "addon", items: [] });

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addOn] }),
		],
		actions: [],
	});

	const proFull = await fetchFullProduct({ ctx, productId: pro.id });
	const addOnFull = await fetchFullProduct({ ctx, productId: addOn.id });
	const proStripePriceId = getBaseStripePriceId({ fullProduct: proFull });
	const addOnStripePriceId = getBaseStripePriceId({
		fullProduct: addOnFull,
	});
	const stripeCustomerId = await getStripeCustomerId({ ctx, customerId });

	// Subscribe to Pro (qty 1) + the add-on at quantity 2.
	const subscription = await ctx.stripeCli.subscriptions.create({
		customer: stripeCustomerId,
		items: [
			{ price: proStripePriceId },
			{ price: addOnStripePriceId, quantity: 2 },
		],
	});

	const { match, params } = await subscriptionToSyncParams({
		ctx,
		customerId,
		subscription,
	});

	console.log("Params:", JSON.stringify(params, null, 2));

	expectSyncParamsCorrect({
		params,
		customer_id: customerId,
		stripe_subscription_id: subscription.id,
		phases: [
			{
				starts_at: "now",
				plans: [
					{ plan_id: pro.id, quantity: 1 },
					{ plan_id: addOn.id, quantity: 2 },
				],
			},
		],
	});

	expectSubscriptionMatchCorrect({
		match,
		currentPhase: {
			plans: [
				{ plan_id: pro.id, base_kind: "matched" },
				{ plan_id: addOn.id, base_kind: "matched" },
			],
			noUnmatchedItems: true,
		},
	});
});
