import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("attach: entity - upgrade entity-2 to premium mid-cycle (proration)")}`, async () => {
	const customerId = "entity-upgrade-proration";

	const pro = products.pro({
		id: "pro",
		items: [
			items.dashboard(),
			items.monthlyMessages({
				includedUsage: 200,
				entityFeatureId: TestFeature.Users,
			}),
			items.consumableWords({
				includedUsage: 50,
				entityFeatureId: TestFeature.Users,
			}),
		],
	});

	const premium = products.premium({
		id: "premium",
		items: [
			items.dashboard(),
			items.adminRights(),
			items.monthlyMessages({
				includedUsage: 500,
				entityFeatureId: TestFeature.Users,
			}),
			items.consumableWords({
				includedUsage: 200,
				entityFeatureId: TestFeature.Users,
			}),
			items.prepaidUsers({ includedUsage: 5, billingUnits: 1 }),
		],
	});

	const { autumnV1, entities, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true, paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: "pro", entityIndex: 0 }),
			s.attach({ productId: "pro", entityIndex: 1 }),
			s.advanceTestClock({ days: 15 }),
		],
	});

	console.log("advanced to:", new Date(advancedTo).toISOString());

	const customerBefore = await autumnV1.customers.get(customerId);
	console.log("customer before mid-cycle upgrade:", {
		products: customerBefore.products?.map(
			(p: { id: string; name: string | null }) => ({
				id: p.id,
				name: p.name,
			}),
		),
		entities: entities.map((e) => ({ id: e.id, name: e.name })),
	});

	const premiumOptions = [{ feature_id: TestFeature.Users, quantity: 10 }];

	const upgradePreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `premium_${customerId}`,
		entity_id: entities[1].id,
		options: premiumOptions,
		redirect_mode: "always",
	});
	console.log("mid-cycle entity upgrade preview (prorated):", upgradePreview);

	const upgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `premium_${customerId}`,
		entity_id: entities[1].id,
		redirect_mode: "always",
		options: premiumOptions,
	});
	console.log("mid-cycle entity upgrade result:", upgradeResult);
});
