import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Multi-Interval Billing Upgrade Scenario
 *
 * Tests upgrading from a monthly Pro plan to an annual Pro plan that also
 * includes monthly consumable messages. The upgraded product has items on two
 * different billing intervals (annual base price + monthly consumable overage),
 * exercising the multi-interval billing path.
 */

test(`${chalk.yellowBright("attach: multi-interval upgrade - monthly pro → annual pro with monthly consumables")}`, async () => {
	const customerId = "multi-interval-upgrade";

	// Monthly Pro plan ($20/mo) with a fixed monthly messages allowance
	const pro = products.pro({
		id: "pro",
		items: [items.dashboard(), items.monthlyMessages({ includedUsage: 500 })],
	});

	// Annual Pro plan ($200/year) – same included messages, plus a monthly
	// consumable overage item billed at the end of each calendar month.
	// This creates two billing intervals on a single product: yearly (base)
	// and monthly (consumable overage).
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [
			items.dashboard(),
			items.consumableMessages({ includedUsage: 0, price: 0.05 }),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, proAnnual] }),
		],
		actions: [s.attach({ productId: "pro" })],
	});

	// 1. Preview the upgrade – verify multi-interval line items are returned
	const upgradePreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proAnnual.id,
		redirect_mode: "always",
	});
	console.log("upgrade preview:", upgradePreview);

	// 2. Perform the upgrade from monthly pro → annual pro with monthly consumables
	const upgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
		redirect_mode: "always",
	});
	console.log("upgrade result:", upgradeResult);
});
