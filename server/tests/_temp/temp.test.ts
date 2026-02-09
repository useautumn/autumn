import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Test: Attach free default product, then attach pro with invoice mode
 */
test.concurrent(`${chalk.yellowBright("invoice-mode: free default then pro with invoice checkout")}`, async () => {
	const users = items.monthlyUsers({ includedUsage: 1 });
	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 }), users],
	});
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 }), users],
	});
	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 100 }), users],
	});
	const { autumnV1 } = await initScenario({
		customerId: "test",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [free, pro, premium] }),
		],
		actions: [],
	});

	await autumnV1.attach({
		customer_id: "test",
		product_id: pro.id,
	});
});
