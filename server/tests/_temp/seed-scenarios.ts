#!/usr/bin/env bun

import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { createTestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";

const SEED_PREFIX = "seed";

async function seedScenarios() {
	const ctx = await createTestContext();

	const proProduct = products.pro({
		id: "pro",
		items: [
			items.consumableWords({ includedUsage: 100 }),
			items.allocatedWorkflows({ includedUsage: 3 }),
			items.prepaidMessages({
				includedUsage: 100,
				billingUnits: 100,
				price: 10,
			}),
		],
	});

	const recurringAddOn = products.recurringAddOn({
		id: "addon",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const freeProduct = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
		isDefault: true,
	});

	const oneTimeProduct = products.oneOff({
		id: "one-time",
		items: [
			items.oneOffMessages({ includedUsage: 0, billingUnits: 500, price: 25 }),
		],
	});

	const premiumProduct = products.base({
		id: "premium",
		items: [
			items.monthlyPrice({ price: 50 }),
			items.consumableWords({ includedUsage: 500 }),
			items.allocatedWorkflows({ includedUsage: 10 }),
			items.prepaidMessages({
				includedUsage: 200,
				billingUnits: 100,
				price: 8,
			}),
		],
	});

	const growthProduct = products.growth({
		id: "growth",
		items: [
			items.consumableWords({ includedUsage: 1000 }),
			items.allocatedWorkflows({ includedUsage: 10 }),
			items.prepaidMessages({
				includedUsage: 200,
				billingUnits: 100,
				price: 6,
			}),
		],
	});

	const allProducts = [
		proProduct,
		recurringAddOn,
		freeProduct,
		oneTimeProduct,
		premiumProduct,
		growthProduct,
	];

	await initScenario({
		ctx,
		customerId: SEED_PREFIX,
		setup: [
			s.customer({ paymentMethod: "success", testClock: false }),
			s.products({ list: allProducts }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({
				productId: proProduct.id,
				options: [{ feature_id: "messages", quantity: 100 }],
			}),
			s.attach({
				productId: recurringAddOn.id,
			}),

			s.attach({
				productId: premiumProduct.id,
				entityIndex: 0,
				options: [{ feature_id: "messages", quantity: 300 }],
			}),
		],
	});

	process.exit(0);
}

seedScenarios()
	.catch((error) => {
		console.error("Seed script failed:", error);
		process.exit(1);
	})
	.finally(() => {
		process.exit(0);
	});
