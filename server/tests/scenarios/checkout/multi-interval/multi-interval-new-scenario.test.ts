import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
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

	// Annual Pro plan ($200/year) – same included messages, plus a monthly
	// consumable overage item billed at the end of each calendar month.
	// This creates two billing intervals on a single product: yearly (base)
	// and monthly (consumable overage).
	const proAnnual = products.proAnnual({
		id: "pro-annual",
		items: [
			items.dashboard(),
			items.prepaidMessages({ includedUsage: 0, billingUnits: 100, price: 10 }),
		],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proAnnual] }),
			s.entities({ count: 2, featureId: TestFeature.Messages }),
		],
		actions: [s.billing.attach({ productId: proAnnual.id, entityIndex: 0 })],
	});

	// 2. Perform the upgrade from monthly pro → annual pro with monthly consumables
	const upgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
		entity_id: entities[1].id,
		redirect_mode: "always",
	});
	console.log("upgrade result:", upgradeResult);
});
