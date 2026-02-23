import { test } from "bun:test";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("create: basic with ID")}`, async () => {
	const customerId = "create-basic-id";

	const proProduct = products.pro({
		items: [
			items.monthlyMessages(),
			items.consumableWords({ includedUsage: 100 }),
		],
	});
	const { autumnV1 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false })],
		actions: [],
	});
});
