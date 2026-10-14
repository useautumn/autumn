import { expect, test } from "bun:test";
import { buildSubscriptionCacheKey } from "@autumn/cache";
import type { ApiCustomerV5 } from "@autumn/shared";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { pollUntil } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { getMiscRedis } from "@/external/redis/miscCache/getMiscRedis";
import { readCachedSubscriptions } from "@/internal/subscriptions/actions/readCachedSubscriptions";
import { SubService } from "@/internal/subscriptions/SubService";

test.concurrent(
	`${chalk.yellowBright("subscription cache: a read fills the key, a Stripe-side period change drops it")}`,
	async () => {
		const customerId = "sub-cache-anchor-reset";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});

		const { ctx, autumnV2_1 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: true, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ days: 10, waitForSeconds: 15 }),
			],
		});

		const stripeId = await getSubscriptionId({
			ctx,
			customerId,
			productId: pro.id,
		});
		const key = buildSubscriptionCacheKey({ stripeId });

		await getMiscRedis().del(key);
		const [firstRead] = await readCachedSubscriptions({
			ctx,
			stripeIds: [stripeId],
		});
		expect(firstRead?.stripe_id).toBe(stripeId);
		expect(await getMiscRedis().exists(key)).toBe(1);

		const [cachedRead] = await readCachedSubscriptions({
			ctx,
			stripeIds: [stripeId],
		});
		expect(cachedRead).toEqual(firstRead);

		const originalAnchor = firstRead?.billing_cycle_anchor_seconds;
		await ctx.stripeCli.subscriptions.update(stripeId, {
			billing_cycle_anchor: "now",
			proration_behavior: "none",
		});
		const stripeSubscription =
			await ctx.stripeCli.subscriptions.retrieve(stripeId);
		const newAnchor = stripeSubscription.billing_cycle_anchor;
		expect(newAnchor).not.toBe(originalAnchor);

		await pollUntil({
			fetch: () => SubService.getByStripeId({ db: ctx.db, stripeId }),
			until: (row) => row?.billing_cycle_anchor_seconds === newAnchor,
		});

		expect(await getMiscRedis().exists(key)).toBe(0);
		const [freshRead] = await readCachedSubscriptions({
			ctx,
			stripeIds: [stripeId],
		});
		expect(freshRead?.billing_cycle_anchor_seconds).toBe(newAnchor);
		expect(await getMiscRedis().exists(key)).toBe(1);

		if (!isBalanceWorkerRoute()) return;
		const customer = await autumnV2_1.customers.get<ApiCustomerV5>(customerId);
		const subscription = customer.subscriptions.find(
			({ plan_id }) => plan_id === pro.id,
		);
		expect(subscription?.current_period_start).toBe(
			(freshRead?.current_period_start ?? 0) * 1000,
		);
	},
	120_000,
);
