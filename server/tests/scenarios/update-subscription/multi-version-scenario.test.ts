import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Multi-Version Update Subscription Scenario
 *
 * Tests upgrading a customer from a simple v1 product to a more complex v2
 * with prepaid prices, consumable usage, and additional features.
 *
 * v1: Simple - $20/month base price + 100 free monthly messages
 * v2: Complex - $40/month base price + prepaid credits ($10/100 units) + consumable words + dashboard access
 *
 * Flow: attach v1 → create v2 → update subscription to v2
 */

test(`${chalk.yellowBright("multi-version: simple v1 → complex v2 with prepaid prices")}`, async () => {
	const customerId = "multi-version-update";

	// v1: Simple product - flat price + free monthly messages
	const messagesItemV1 = items.monthlyMessages({ includedUsage: 100 });
	const priceItemV1 = items.monthlyPrice({ price: 20 });
	const pro = products.base({
		id: "pro",
		items: [messagesItemV1, priceItemV1],
	});

	// Attach v1 to customer
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// Create v2: More complex with prepaid messages, consumable words, dashboard, and higher base price
	const priceItemV2 = items.monthlyPrice({ price: 40 });
	const prepaidCreditsV2 = items.prepaid({
		featureId: "credits",
		includedUsage: 0,
		billingUnits: 100,
		price: 10,
	});
	const consumableWordsV2 = items.consumableWords({ includedUsage: 0 });
	const dashboardV2 = items.dashboard();

	await autumnV1.products.update(pro.id, {
		items: [priceItemV2, prepaidCreditsV2, consumableWordsV2, dashboardV2],
	});

	// // Update subscription to v2
	// await autumnV1.subscriptions.update({
	// 	customer_id: customerId,
	// 	product_id: pro.id,
	// 	version: 2,
	// });
});
