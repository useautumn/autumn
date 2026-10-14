import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("checkout: complex - product with many line items")}`, async () => {
	const customerId = "checkout-complex";

	const enterprise = products.base({
		id: "enterprise",
		items: [
			items.dashboard(),
			items.adminRights(),
			items.monthlyCredits({ includedUsage: 250 }),
			items.prepaidMessages({
				includedUsage: 100,
				billingUnits: 100,
				price: 25,
			}),
			items.consumableWords({ includedUsage: 200 }),
			items.prepaidUsers({ includedUsage: 5 }),
			items.allocatedWorkflows({ includedUsage: 3 }),
			items.monthlyPrice({ price: 99 }),
		],
	});

	const options = [
		{ feature_id: TestFeature.Messages, quantity: 500, adjustable: true },
		{ feature_id: TestFeature.Users, quantity: 10 },
	];

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [enterprise] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: enterprise.id, entityIndex: 0, options })],
	});

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: enterprise.id,
		entity_id: entities[1].id,
		redirect_mode: "always",
		options,
	});
	console.log("result:", result);
});
