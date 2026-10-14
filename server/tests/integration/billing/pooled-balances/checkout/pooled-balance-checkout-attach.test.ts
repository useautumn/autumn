import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type AttachParamsV1Input,
	EntInterval,
	PooledBalanceResetMode,
	ProductItemInterval,
} from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool/completeStripeCheckoutFormV2.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectPooledBalanceCorrect } from "../utils/expectPooledBalanceCorrect.js";

const POOLED_GRANT = 100;
const USAGE = 30;
const CHECKOUT_WEBHOOK_MS = 12_000;

const SUBSCRIPTION_POOL_LIFECYCLE = {
	interval: EntInterval.Month,
	nextResetAt: "present",
	resetCycleAnchor: "present",
	resetMode: PooledBalanceResetMode.Subscription,
	stripeSubscriptionId: "stripe_subscription",
} as const;

test(
	chalk.yellowBright(
		"pooled checkout: checkout session creates the pool, later entities increment it",
	),
	async () => {
		const customerId = "pooled-checkout-attach";
		const pooledPlan = products.pro({
			id: "pooled-checkout-plan",
			items: [
				{
					...items.monthlyMessages({ includedUsage: POOLED_GRANT }),
					pooled: true,
				},
			],
		});

		const { autumnV2_2, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
				s.products({ list: [pooledPlan] }),
			],
			actions: [],
		});

		const checkoutResult = await autumnV2_2.billing.attach<AttachParamsV1Input>(
			{
				customer_id: customerId,
				entity_id: entities[0].id,
				plan_id: pooledPlan.id,
			},
			{ timeout: 0 },
		);
		expect(checkoutResult.payment_url).toContain("checkout.stripe.com");

		await completeStripeCheckoutFormV2({ url: checkoutResult.payment_url! });
		await timeout(CHECKOUT_WEBHOOK_MS);

		const afterCheckout = await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: POOLED_GRANT,
				adjustment: 0,
				granted: POOLED_GRANT,
				...SUBSCRIPTION_POOL_LIFECYCLE,
			},
			contributions: {
				count: 1,
				currentContribution: POOLED_GRANT,
				nextCycleContribution: POOLED_GRANT,
			},
			sources: { count: 1, balance: 0, adjustment: 0 },
		});
		const pooledCustomerEntitlement = afterCheckout.poolCustomerEntitlements[0];

		const customerAfterCheckout = await autumnV2_2.customers.get<ApiCustomerV5>(
			customerId,
			{
				skip_cache: "true",
			},
		);
		expectBalanceCorrect({
			customer: customerAfterCheckout,
			featureId: TestFeature.Messages,
			granted: POOLED_GRANT,
			includedGrant: POOLED_GRANT,
			remaining: POOLED_GRANT,
			usage: 0,
			breakdownCount: 1,
			breakdownId: pooledCustomerEntitlement.id,
		});

		const secondAttach = await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			entity_id: entities[1].id,
			plan_id: pooledPlan.id,
		});
		expect(secondAttach.payment_url).toBeFalsy();

		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: POOLED_GRANT * 2,
				adjustment: 0,
				granted: POOLED_GRANT * 2,
				...SUBSCRIPTION_POOL_LIFECYCLE,
			},
			contributions: {
				count: 2,
				currentContribution: POOLED_GRANT,
				nextCycleContribution: POOLED_GRANT,
			},
			sources: { count: 2, balance: 0, adjustment: 0 },
		});

		await autumnV2_2.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			entity_id: entities[2].id,
			plan_id: pooledPlan.id,
		});

		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: POOLED_GRANT * 3,
				adjustment: 0,
				granted: POOLED_GRANT * 3,
				...SUBSCRIPTION_POOL_LIFECYCLE,
			},
			contributions: {
				count: 3,
				currentContribution: POOLED_GRANT,
				nextCycleContribution: POOLED_GRANT,
			},
			sources: { count: 3, balance: 0, adjustment: 0 },
		});

		const customerAfterThirdAttach =
			await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
				skip_cache: "true",
			});
		expectBalanceCorrect({
			customer: customerAfterThirdAttach,
			featureId: TestFeature.Messages,
			granted: POOLED_GRANT * 3,
			includedGrant: POOLED_GRANT * 3,
			remaining: POOLED_GRANT * 3,
			usage: 0,
			breakdownCount: 1,
			breakdownId: pooledCustomerEntitlement.id,
		});

		await autumnV2_2.track({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
			value: USAGE,
		});
		await timeout(2000);

		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: POOLED_GRANT * 3 - USAGE,
				adjustment: 0,
				granted: POOLED_GRANT * 3,
				...SUBSCRIPTION_POOL_LIFECYCLE,
			},
			contributions: {
				count: 3,
				currentContribution: POOLED_GRANT,
				nextCycleContribution: POOLED_GRANT,
			},
			sources: { count: 3, balance: 0, adjustment: 0 },
		});

		const customerAfterUsage = await autumnV2_2.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		expectBalanceCorrect({
			customer: customerAfterUsage,
			featureId: TestFeature.Messages,
			granted: POOLED_GRANT * 3,
			includedGrant: POOLED_GRANT * 3,
			remaining: POOLED_GRANT * 3 - USAGE,
			usage: USAGE,
			breakdownCount: 1,
			breakdownId: pooledCustomerEntitlement.id,
		});
	},
);

test.concurrent(
	chalk.yellowBright("pooled checkout: unlimited creates a zero-valued pool"),
	async () => {
		const customerId = "pooled-checkout-unlimited";
		const pooledPlan = products.pro({
			id: "pooled-checkout-unlimited-plan",
			items: [
				{
					...items.unlimitedMessages(),
					interval: ProductItemInterval.Month,
					pooled: true,
				},
			],
		});
		const { autumnV2_2, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [pooledPlan] }),
			],
			actions: [],
		});

		const checkoutResult = await autumnV2_2.billing.attach<AttachParamsV1Input>(
			{
				customer_id: customerId,
				entity_id: entities[0].id,
				plan_id: pooledPlan.id,
			},
			{ timeout: 0 },
		);
		expect(checkoutResult.payment_url).toContain("checkout.stripe.com");
		await completeStripeCheckoutFormV2({ url: checkoutResult.payment_url! });
		await timeout(CHECKOUT_WEBHOOK_MS);

		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: 0,
				adjustment: 0,
				granted: 0,
				unlimited: true,
				interval: EntInterval.Month,
				nextResetAt: null,
				resetCycleAnchor: null,
				resetMode: PooledBalanceResetMode.Subscription,
				stripeSubscriptionId: "stripe_subscription",
			},
			contributions: {
				count: 1,
				currentContribution: 0,
				nextCycleContribution: 0,
			},
			sources: { count: 1, balance: 0, adjustment: 0 },
		});
		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			unlimited: true,
			granted: 0,
			remaining: 0,
			usage: 0,
		});
	},
);
