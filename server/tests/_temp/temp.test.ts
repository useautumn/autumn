import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(`${chalk.yellowBright("temp: concurrent entitled calls")}`, async () => {
	const wordsItem = items.monthlyWords({ includedUsage: 200 });
	const free = products.base({
		id: "free",
		items: [wordsItem],
		isDefault: true,
	});

	const { customerId, autumnV1 } = await initScenario({
		customerId: "temp-entitled-concurrent",
		setup: [s.customer({ withDefault: true }), s.products({ list: [free] })],
		actions: [],
	});

	// Call /entitled 5 times concurrently
	const entitledPromises = Array.from({ length: 5 }, () =>
		autumnV1.entitled({
			customerId,
			featureId: TestFeature.Words,
		}),
	);

	const entitledResults = await Promise.all(entitledPromises);

	// Verify all entitled calls succeeded
	for (const result of entitledResults) {
		expect(result.allowed).toBe(true);
	}

	// Call /events with value 25
	await autumnV1.events.send({
		customerId,
		featureId: TestFeature.Words,
		value: 25,
	});

	// Verify balance is now 200 - 25 = 175
	const customer = await autumnV1.customers.get(customerId);
	expect(customer.features[TestFeature.Words].balance).toBe(175);
});
