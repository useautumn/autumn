import { test } from "bun:test";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/**
 * Test: Attach free default product, then attach pro with invoice mode
 */
test.concurrent(`${chalk.yellowBright("invoice-mode: free default then pro with invoice checkout")}`, async () => {
	const { autumnV1 } = await initScenario({
		customerId: "test",
		setup: [
			s.customer({ paymentMethod: "success" }),
			// s.products({ list: [free, pro] }),
		],
		actions: [],
	});

	await autumnV1.attach({
		customer_id: "test",
		product_id: "pro_seed-cancel-test",
		options: [
			{
				feature_id: "messages",
				quantity: 100,
			},
		],
	});
});
