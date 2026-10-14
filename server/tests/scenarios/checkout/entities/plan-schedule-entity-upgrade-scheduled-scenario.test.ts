import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("plan_schedule: entity upgrade with end_of_cycle override")}`, async () => {
	const customerId = "plan-schedule-entity-upgrade";

	const pro = products.pro({
		id: "pro",
		items: [
			items.dashboard(),
			items.monthlyMessages({
				includedUsage: 500,
				entityFeatureId: TestFeature.Users,
			}),
			items.consumableWords({
				includedUsage: 200,
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
				includedUsage: 1000,
				entityFeatureId: TestFeature.Users,
			}),
			items.consumableWords({
				includedUsage: 500,
				entityFeatureId: TestFeature.Users,
			}),
		],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: "pro", entityIndex: 0 })],
	});

	const customerBefore = await autumnV1.customers.get(customerId);
	console.log("Customer before entity 2 scheduled upgrade:", {
		products: customerBefore.products?.map(
			(p: { id: string; name: string | null }) => ({
				id: p.id,
				name: p.name,
			}),
		),
		entities: entities.map((e) => ({ id: e.id, name: e.name })),
	});

	const upgradePreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: `premium_${customerId}`,
		plan_schedule: "end_of_cycle",
		redirect_mode: "always",
	});
	console.log(
		"Entity 2 upgrade preview (scheduled for end of cycle):",
		upgradePreview,
	);

	const upgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: `premium_${customerId}`,
		plan_schedule: "end_of_cycle",
		redirect_mode: "always",
	});
	console.log("Entity 2 upgrade result:", upgradeResult);

	const customerAfter = await autumnV1.customers.get(customerId);
	console.log("Customer after entity 2 scheduled upgrade:", {
		products: customerAfter.products?.map(
			(p: { id: string; name: string | null; status: string }) => ({
				id: p.id,
				name: p.name,
				status: p.status,
			}),
		),
	});
});
