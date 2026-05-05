/**
 * subscriptionToSyncParams — schedule cases
 *
 * Exercises detection against Stripe subscription schedules where the live
 * subscription (phase 0) plus future phases get folded into a multi-phase
 * `SyncParamsV1`. Each test:
 *   1. Sets up Autumn customer + product(s)
 *   2. Creates a Stripe subscription schedule with multiple phases
 *   3. Calls `subscriptionToSyncParams({ subscription, schedule })`
 *   4. Asserts on `params.phases` + match-side `phaseMatches`
 *
 * Cases:
 *   A) One product (Pro), 3 phases, base price doubles each phase. Phase 0
 *      uses Pro's catalog Stripe price (matched), phases 1+2 use custom
 *      Stripe prices under Pro's stripe_product_id.
 *
 *   B) Two products. Phase 0 uses Pro's catalog price; phase 1 uses
 *      Premium's catalog price.
 *
 *   C) Two products. Phase 0 uses Pro's catalog price; phase 1 uses a
 *      CUSTOM Stripe price under Premium's stripe_product_id.
 */

import { test } from "bun:test";
import { expectSubscriptionMatchCorrect } from "@tests/integration/billing/utils/sync/expectSubscriptionMatch";
import { expectSyncParamsCorrect } from "@tests/integration/billing/utils/sync/expectSyncParams";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { subscriptionToSyncParams } from "@/internal/billing/v2/actions/sync/subscriptionToSyncParams";
import {
	createStripeFixedPriceUnderProduct,
	createStripeSubscriptionSchedule,
	fetchFullProduct,
	getBaseStripePriceId,
	getProductStripeProductId,
} from "../utils/syncProductHelpers";

// ═══════════════════════════════════════════════════════════════════════════════
// CASE A: Pro, 3 phases, base price doubles each phase ($20 → $40 → $80)
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("to-sync-params: schedule A — Pro, 3 phases doubling base")}`, async () => {
	const customerId = "to-sync-params-sched-a";
	const pro = products.pro({ id: "pro", items: [] });

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	const proFull = await fetchFullProduct({ ctx, productId: pro.id });
	const proStandardPriceId = getBaseStripePriceId({ fullProduct: proFull });
	const proStripeProductId = getProductStripeProductId({
		fullProduct: proFull,
	});

	// Custom Stripe prices under Pro's stripe product for phases 1 and 2
	const phase1Price = await createStripeFixedPriceUnderProduct({
		ctx,
		stripeProductId: proStripeProductId,
		unitAmount: 4000, // $40
	});
	const phase2Price = await createStripeFixedPriceUnderProduct({
		ctx,
		stripeProductId: proStripeProductId,
		unitAmount: 8000, // $80
	});

	const { subscription, schedule } = await createStripeSubscriptionSchedule({
		ctx,
		customerId,
		phases: [
			{ items: [{ price: proStandardPriceId }] },
			{ items: [{ price: phase1Price.id }] },
			{ items: [{ price: phase2Price.id }] },
		],
	});

	const { match, params } = await subscriptionToSyncParams({
		ctx,
		customerId,
		subscription,
		schedule,
	});

	expectSyncParamsCorrect({
		params,
		customer_id: customerId,
		stripe_subscription_id: subscription.id,
		stripe_schedule_id: schedule.id,
		phases: [
			{
				starts_at: "now",
				plans: [{ plan_id: pro.id, customize: null }],
			},
			{
				plans: [
					{
						plan_id: pro.id,
						customize: {
							price: {
								amount: 40,
								interval: "month",
								stripe_price_id: phase1Price.id,
							},
						},
					},
				],
			},
			{
				plans: [
					{
						plan_id: pro.id,
						customize: {
							price: {
								amount: 80,
								interval: "month",
								stripe_price_id: phase2Price.id,
							},
						},
					},
				],
			},
		],
	});

	expectSubscriptionMatchCorrect({
		match,
		phaseMatches: [
			{
				is_current: true,
				plans: [{ plan_id: pro.id, base_kind: "matched" }],
				noUnmatchedItems: true,
			},
			{
				is_current: false,
				plans: [{ plan_id: pro.id, base_kind: "custom" }],
				noUnmatchedItems: true,
			},
			{
				is_current: false,
				plans: [{ plan_id: pro.id, base_kind: "custom" }],
				noUnmatchedItems: true,
			},
		],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// CASE B: schedule with phase 0 = Pro standard, phase 1 = Premium standard
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("to-sync-params: schedule B — Pro then Premium, both standard prices")}`, async () => {
	const customerId = "to-sync-params-sched-b";
	const pro = products.pro({ id: "pro", items: [] });
	const premium = products.premium({ id: "premium", items: [] });

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [],
	});

	const proFull = await fetchFullProduct({ ctx, productId: pro.id });
	const premiumFull = await fetchFullProduct({
		ctx,
		productId: premium.id,
	});
	const proPriceId = getBaseStripePriceId({ fullProduct: proFull });
	const premiumPriceId = getBaseStripePriceId({ fullProduct: premiumFull });

	const { subscription, schedule } = await createStripeSubscriptionSchedule({
		ctx,
		customerId,
		phases: [
			{ items: [{ price: proPriceId }] },
			{ items: [{ price: premiumPriceId }] },
		],
	});

	const { match, params } = await subscriptionToSyncParams({
		ctx,
		customerId,
		subscription,
		schedule,
	});

	expectSyncParamsCorrect({
		params,
		customer_id: customerId,
		stripe_subscription_id: subscription.id,
		stripe_schedule_id: schedule.id,
		phases: [
			{
				starts_at: "now",
				plans: [{ plan_id: pro.id, customize: null }],
			},
			{
				plans: [{ plan_id: premium.id, customize: null }],
			},
		],
	});

	expectSubscriptionMatchCorrect({
		match,
		phaseMatches: [
			{
				is_current: true,
				plans: [{ plan_id: pro.id, base_kind: "matched" }],
				noUnmatchedItems: true,
			},
			{
				is_current: false,
				plans: [{ plan_id: premium.id, base_kind: "matched" }],
				noUnmatchedItems: true,
			},
		],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// CASE C: phase 0 = Pro standard, phase 1 = custom price under Premium stripe product
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(`${chalk.yellowBright("to-sync-params: schedule C — Pro then custom-base under Premium")}`, async () => {
	const customerId = "to-sync-params-sched-c";
	const pro = products.pro({ id: "pro", items: [] });
	const premium = products.premium({ id: "premium", items: [] });

	await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [],
	});

	const proFull = await fetchFullProduct({ ctx, productId: pro.id });
	const premiumFull = await fetchFullProduct({
		ctx,
		productId: premium.id,
	});
	const proPriceId = getBaseStripePriceId({ fullProduct: proFull });
	const premiumStripeProductId = getProductStripeProductId({
		fullProduct: premiumFull,
	});

	// Custom Stripe price under Premium's stripe product (priority-3 match)
	const customPremiumPrice = await createStripeFixedPriceUnderProduct({
		ctx,
		stripeProductId: premiumStripeProductId,
		unitAmount: 12000, // $120 — distinct from premium's catalog price
	});

	const { subscription, schedule } = await createStripeSubscriptionSchedule({
		ctx,
		customerId,
		phases: [
			{ items: [{ price: proPriceId }] },
			{ items: [{ price: customPremiumPrice.id }] },
		],
	});

	const { match, params } = await subscriptionToSyncParams({
		ctx,
		customerId,
		subscription,
		schedule,
	});

	expectSyncParamsCorrect({
		params,
		customer_id: customerId,
		stripe_subscription_id: subscription.id,
		stripe_schedule_id: schedule.id,
		phases: [
			{
				starts_at: "now",
				plans: [{ plan_id: pro.id, customize: null }],
			},
			{
				plans: [
					{
						plan_id: premium.id,
						customize: {
							price: {
								amount: 120,
								interval: "month",
								stripe_price_id: customPremiumPrice.id,
							},
						},
					},
				],
			},
		],
	});

	expectSubscriptionMatchCorrect({
		match,
		phaseMatches: [
			{
				is_current: true,
				plans: [{ plan_id: pro.id, base_kind: "matched" }],
				noUnmatchedItems: true,
			},
			{
				is_current: false,
				plans: [{ plan_id: premium.id, base_kind: "custom" }],
				noUnmatchedItems: true,
			},
		],
	});
});
