import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("migration-setup: paid plan multi-version")}`, async () => {
	const pro = products.base({
		id: "pro",
		items: [
			items.monthlyPrice({ price: 20 }),
			items.monthlyMessages({ includedUsage: 100 }),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId: "migpaid-v1",
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: [pro], prefix: "migpaid" }),
			s.otherCustomers([
				{ id: "migpaid-v2", paymentMethod: "success" },
				{ id: "migpaid-v3", paymentMethod: "success" },
				{ id: "migpaid-v4", paymentMethod: "success" },
			]),
		],
		actions: [s.billing.attach({ productId: "pro" })],
	});

	await autumnV1.products.update(pro.id, {
		items: [
			items.monthlyPrice({ price: 30 }),
			items.monthlyMessages({ includedUsage: 200 }),
		],
	});
	await autumnV1.billing.attach({ customer_id: "migpaid-v2", product_id: pro.id });

	await autumnV1.products.update(pro.id, {
		items: [
			items.monthlyPrice({ price: 40 }),
			items.monthlyMessages({ includedUsage: 300 }),
		],
	});
	await autumnV1.billing.attach({ customer_id: "migpaid-v3", product_id: pro.id });

	await autumnV1.products.update(pro.id, {
		items: [
			items.monthlyPrice({ price: 50 }),
			items.monthlyMessages({ includedUsage: 500 }),
		],
	});
	await autumnV1.billing.attach({ customer_id: "migpaid-v4", product_id: pro.id });

	await autumnV1.products.update(pro.id, {
		items: [
			items.monthlyPrice({ price: 60 }),
			items.monthlyMessages({ includedUsage: 1000 }),
		],
	});

	console.log(
		chalk.green(
			`[migration-setup] plan "${pro.id}" has v1-v5. Customers migpaid-v1..migpaid-v4 sit on v1..v4; latest is v5.`,
		),
	);
});
