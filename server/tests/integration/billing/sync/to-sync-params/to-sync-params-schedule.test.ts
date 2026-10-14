import { test } from "bun:test";
import { ms } from "@autumn/shared";
import { expectSubscriptionMatchCorrect } from "@tests/integration/billing/utils/sync/expectSubscriptionMatch";
import { expectSyncParamsCorrect } from "@tests/integration/billing/utils/sync/expectSyncParams";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { subscriptionToSyncParams } from "@/internal/billing/v2/actions/sync/subscriptionToSyncParams";
import {
	createStripeFixedPriceUnderProduct,
	createFutureStripeSubscriptionSchedule,
	createStripeSubscriptionSchedule,
	fetchFullProduct,
	getBaseStripePriceId,
	getProductStripeProductId,
} from "../utils/syncProductHelpers";

test.concurrent(`${chalk.yellowBright("to-sync-params: schedule-only future Pro")}`, async () => {
	const customerId = "to-sync-params-sched-only";
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
	const proPriceId = getBaseStripePriceId({ fullProduct: proFull });
	const schedule = await createFutureStripeSubscriptionSchedule({
		ctx,
		customerId,
		startDateMs: Date.now() + ms.days(1),
		phases: [{ items: [{ price: proPriceId }] }],
	});

	const { match, params } = await subscriptionToSyncParams({
		ctx,
		customerId,
		schedule,
	});

	expectSyncParamsCorrect({
		params,
		customer_id: customerId,
		stripe_schedule_id: schedule.id,
		phases: [
			{
				starts_at: schedule.phases[0].start_date * 1000,
				plans: [{ plan_id: pro.id, customize: null }],
			},
		],
	});

	expectSubscriptionMatchCorrect({
		match,
		phaseMatches: [
			{
				is_current: false,
				plans: [{ plan_id: pro.id, base_kind: "matched" }],
				noUnmatchedItems: true,
			},
		],
	});
});

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

	const phase1Price = await createStripeFixedPriceUnderProduct({
		ctx,
		stripeProductId: proStripeProductId,
		unitAmount: 4000,
	});
	const phase2Price = await createStripeFixedPriceUnderProduct({
		ctx,
		stripeProductId: proStripeProductId,
		unitAmount: 8000,
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

	const customPremiumPrice = await createStripeFixedPriceUnderProduct({
		ctx,
		stripeProductId: premiumStripeProductId,
		unitAmount: 12000,
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
