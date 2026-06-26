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
import type { ApiCustomerV3 } from "@autumn/shared";
import { getFirstStripePriceId } from "@tests/integration/billing/sync/utils/syncTestUtils";
import { getSubscriptionId } from "@tests/integration/billing/utils/stripe/getSubscriptionId";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService";

test.concurrent(
	chalk.yellowBright(
		"sub.updated portal plan sync: Stripe item price change backsyncs Ultra to Pro",
	),
	async () => {
		const customerId = "sub-updated-portal-plan-sync";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
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
		const subscription = await ctx.stripeCli.subscriptions.retrieve(
			subscriptionId,
		);
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
		const proStripePriceId = getFirstStripePriceId({ fullProduct: fullPro });

		await ctx.stripeCli.subscriptionItems.update(subscriptionItemId, {
			price: proStripePriceId,
			proration_behavior: "none",
		});

		await timeout(10000);

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectCustomerProducts({
			customer,
			active: [pro.id],
			notPresent: [ultra.id],
		});
	},
	30000,
);
