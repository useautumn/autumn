/**
 * TDD test for Stripe Billing Portal plan changes.
 *
 * Red-failure mode (current behavior):
 *  - Stripe's customer.subscription.updated webhook changes the subscription
 *    item price from Ultra to Pro, but Autumn keeps Ultra active.
 *
 * Green-success criteria (after fix):
 *  - The webhook backsync expires Ultra and activates Pro.
 */

import { test } from "bun:test";
import type { ApiCustomerV3, ProductItem } from "@autumn/shared";
import {
	getAllStripePriceIds,
	getFirstStripePriceId,
} from "@tests/integration/billing/sync/utils/syncTestUtils";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService";

type ScenarioContext = Awaited<ReturnType<typeof initScenario>>;

const setupPortalPlanSync = async ({
	customerId,
	proItems = [items.monthlyMessages({ includedUsage: 100 })],
}: {
	customerId: string;
	proItems?: ProductItem[];
}) => {
	const pro = products.pro({
		id: "pro",
		items: proItems,
	});
	const ultra = products.ultra({
		id: "ultra",
		items: [items.monthlyMessages({ includedUsage: 200 })],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, ultra] }),
		],
		actions: [s.billing.attach({ productId: ultra.id })],
	});

	const subscriptionId = await getSubscriptionId({
		ctx,
		customerId,
		productId: ultra.id,
	});
	const subscription = await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
	const subscriptionItemId = subscription.items.data[0]?.id;
	if (!subscriptionItemId) {
		throw new Error(`Subscription ${subscriptionId} has no item to update`);
	}
	await ctx.stripeCli.subscriptions.update(subscriptionId, {
		metadata: {
			autumn_managed_at: "1",
			autumn_managed_source: "attach",
		},
	});

	const fullPro = await ProductService.getFull({
		db: ctx.db,
		idOrInternalId: pro.id,
		orgId: ctx.org.id,
		env: ctx.env,
	});

	return {
		autumnV1,
		ctx,
		pro,
		ultra,
		subscriptionId,
		subscriptionItemId,
		proStripePriceIds: getAllStripePriceIds({ fullProduct: fullPro }),
		proStripePriceId: getFirstStripePriceId({ fullProduct: fullPro }),
	};
};

const expectProSynced = async ({
	autumnV1,
	customerId,
	proId,
	ultraId,
}: {
	autumnV1: ScenarioContext["autumnV1"];
	customerId: string;
	proId: string;
	ultraId: string;
}) => {
	await timeout(10000);

	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer,
		active: [proId],
		notPresent: [ultraId],
	});
};

test.concurrent(
	chalk.yellowBright(
		"sub.updated portal plan sync: Stripe item price change backsyncs Ultra to Pro",
	),
	async () => {
		const customerId = "sub-updated-portal-plan-sync";
		const { autumnV1, ctx, pro, ultra, subscriptionItemId, proStripePriceId } =
			await setupPortalPlanSync({ customerId });

		await ctx.stripeCli.subscriptionItems.update(subscriptionItemId, {
			price: proStripePriceId,
			proration_behavior: "none",
		});

		await expectProSynced({
			autumnV1,
			customerId,
			proId: pro.id,
			ultraId: ultra.id,
		});
	},
	30000,
);

test.concurrent(
	chalk.yellowBright(
		"sub.updated portal plan sync: replaced Stripe item backsyncs Ultra to Pro",
	),
	async () => {
		const customerId = "sub-updated-portal-item-replace";
		const {
			autumnV1,
			ctx,
			pro,
			ultra,
			subscriptionId,
			subscriptionItemId,
			proStripePriceIds,
		} = await setupPortalPlanSync({
			customerId,
			proItems: [
				items.monthlyMessages({ includedUsage: 100 }),
				items.consumableWords({ includedUsage: 0 }),
			],
		});

		await ctx.stripeCli.subscriptions.update(subscriptionId, {
			items: [
				{ id: subscriptionItemId, deleted: true },
				...proStripePriceIds.map((price) => ({ price })),
			],
			proration_behavior: "none",
		});

		await expectProSynced({
			autumnV1,
			customerId,
			proId: pro.id,
			ultraId: ultra.id,
		});
	},
	30000,
);
