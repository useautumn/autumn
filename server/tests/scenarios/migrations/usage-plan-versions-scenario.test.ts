import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Migration setup: paid plan with consumable (pay-per-use) messages across
 * versions, with tracked usage so you can verify usage carry-over on migrate.
 *
 *   v1  $100/mo · 500 incl, $0.10 overage   → cus migusage-v1 (used 600)
 *   v2  $100/mo · 1000 incl, $0.08 overage  → cus migusage-v2 (used 1200)
 *   v3  $100/mo · 2000 incl, $0.05 overage + admin  (latest, no customer)
 */
test(`${chalk.yellowBright("migration-setup: usage plan multi-version")}`, async () => {
	const growth = products.base({
		id: "growth",
		items: [
			items.monthlyPrice({ price: 100 }),
			items.consumableMessages({ includedUsage: 500, price: 0.1 }),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId: "migusage-v1",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [growth], prefix: "migusage" }),
			s.otherCustomers([{ id: "migusage-v2", paymentMethod: "success" }]),
		],
		actions: [
			s.billing.attach({ productId: "growth" }),
			s.track({ featureId: TestFeature.Messages, value: 600, timeout: 2000 }),
		],
	});

	await autumnV1.products.update(growth.id, {
		items: [
			items.monthlyPrice({ price: 100 }),
			items.consumableMessages({ includedUsage: 1000, price: 0.08 }),
		],
	});
	await autumnV1.billing.attach({
		customer_id: "migusage-v2",
		product_id: growth.id,
	});
	await autumnV1.track({
		customer_id: "migusage-v2",
		feature_id: TestFeature.Messages,
		value: 1200,
	});

	await autumnV1.products.update(growth.id, {
		items: [
			items.monthlyPrice({ price: 100 }),
			items.consumableMessages({ includedUsage: 2000, price: 0.05 }),
			items.adminRights(),
		],
	});

	console.log(
		chalk.green(
			`[migration-setup] plan "${growth.id}" has v1-v3. migusage-v1 (used 600) on v1, migusage-v2 (used 1200) on v2; latest is v3.`,
		),
	);
});
