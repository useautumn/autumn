import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Migration setup: paid plan with prepaid messages across versions.
 * Each customer buys a different prepaid quantity so you can verify
 * quantity preservation when migrating.
 *
 *   v1  $20/mo · prepaid 100/pack @ $10, 0 incl   → cus migprepaid-v1 (qty 200)
 *   v2  $20/mo · prepaid 100/pack @ $8, 100 incl  → cus migprepaid-v2 (qty 300)
 *   v3  $20/mo · prepaid 100/pack @ $8, 200 incl + admin  (latest, no customer)
 */
test(`${chalk.yellowBright("migration-setup: prepaid plan multi-version")}`, async () => {
	const scale = products.base({
		id: "scale",
		items: [
			items.monthlyPrice({ price: 20 }),
			items.prepaidMessages({ includedUsage: 0, billingUnits: 100, price: 10 }),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId: "migprepaid-v1",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [scale], prefix: "migprepaid" }),
			s.otherCustomers([{ id: "migprepaid-v2", paymentMethod: "success" }]),
		],
		actions: [
			s.billing.attach({
				productId: "scale",
				options: [{ feature_id: TestFeature.Messages, quantity: 200 }],
			}),
		],
	});

	await autumnV1.products.update(scale.id, {
		items: [
			items.monthlyPrice({ price: 20 }),
			items.prepaidMessages({
				includedUsage: 100,
				billingUnits: 100,
				price: 8,
			}),
		],
	});
	await autumnV1.billing.attach({
		customer_id: "migprepaid-v2",
		product_id: scale.id,
		options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
	});

	await autumnV1.products.update(scale.id, {
		items: [
			items.monthlyPrice({ price: 20 }),
			items.prepaidMessages({
				includedUsage: 200,
				billingUnits: 100,
				price: 8,
			}),
			items.adminRights(),
		],
	});

	console.log(
		chalk.green(
			`[migration-setup] plan "${scale.id}" has v1-v3. migprepaid-v1 (qty 200) on v1, migprepaid-v2 (qty 300) on v2; latest is v3.`,
		),
	);
});
