import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Complex Checkout Scenario
 *
 * Tests checkout functionality with a product containing many line items
 * including boolean features, metered usage, prepaid, consumable,
 * and allocated seat-based items.
 */

test(`${chalk.yellowBright("checkout: complex - product with many line items")}`, async () => {
	const customerId = "checkout-complex";

	const enterprise = products.base({
		id: "enterprise",
		items: [
			// Boolean features
			items.dashboard(),
			items.adminRights(),
			// Free metered item (reset monthly)
			items.monthlyCredits({ includedUsage: 250 }),
			// Prepaid item (purchase upfront) - uses messages feature
			items.prepaidMessages({
				includedUsage: 100,
				billingUnits: 500,
				price: 25,
			}),
			// Consumable item (pay-per-use overage) - uses words feature
			items.consumableWords({ includedUsage: 200 }),
			// Allocated items (prorated billing)
			items.prepaidUsers({ includedUsage: 5 }),
			items.allocatedWorkflows({ includedUsage: 3 }),
			// Base price
			items.monthlyPrice({ price: 99 }),
		],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [enterprise] }),
		],
		actions: [],
	});

	// Options for prepaid features
	const options = [
		{ feature_id: TestFeature.Messages, quantity: 500 },
		{ feature_id: TestFeature.Users, quantity: 5 },
	];

	// 1. Preview attach
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: enterprise.id,
		options,
		redirect_mode: "always",
	});
	console.log("preview:", preview);

	// 2. Attach with redirect_mode: "always"
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: enterprise.id,
		redirect_mode: "always",
		options,
	});
	console.log("result:", result);
});
