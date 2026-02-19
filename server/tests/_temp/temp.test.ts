import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Test: Attach free default product, then attach pro with invoice mode
 */
test.concurrent(`${chalk.yellowBright("attach: pro plan with failed payment method")}`, async () => {
	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [messagesItem],
	});

	const premium = products.premium({
		id: "premium",
		items: [messagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId: "test-failed-pm",
		setup: [
			s.customer({ paymentMethod: "success" }), // Failed payment method
			s.products({ list: [pro, premium] }),
		],
		actions: [],
	});

	const customerId = "test-failed-pm";
	const result = await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});
	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: premium.id,
		finalize_invoice: true,
		invoice: true,
		enable_product_immediately: false,
	});

	console.log("res", res);
});
