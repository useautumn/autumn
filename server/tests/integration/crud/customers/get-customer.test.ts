import { expect, test } from "bun:test";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("get-customer: expand empty array returns items")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({ id: "pro", items: [messagesItem] });

	const customerId = "get-customer-expand-empty";

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const customer = await autumnV1.customers.create({
		id: customerId,
		expand: [],
	});

	expect(customer.products).toBeDefined();
	expect(customer.products.length).toBeGreaterThan(0);
	expect(customer.products[0].items).toBeDefined();
	expect(customer.products[0].items!.length).toBeGreaterThan(0);
});
