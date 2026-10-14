import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test(`${chalk.yellowBright("plan_schedule: entity downgrade with immediate override")}`, async () => {
	const customerId = "plan-schedule-entity-downgrade";

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
		actions: [
			s.attach({ productId: "premium", entityIndex: 0 }),
			s.attach({ productId: "premium", entityIndex: 1 }),
		],
	});

	const customerBefore = await autumnV1.customers.get(customerId);
	console.log("Customer before entity 2 immediate downgrade:", {
		products: customerBefore.products?.map(
			(p: { id: string; name: string | null }) => ({
				id: p.id,
				name: p.name,
			}),
		),
		entities: entities.map((e) => ({ id: e.id, name: e.name })),
	});

	const downgradePreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: `pro_${customerId}`,
		plan_schedule: "immediate",
		redirect_mode: "always",
	});
	console.log(
		"Entity 2 downgrade preview (immediate with credit):",
		downgradePreview,
	);

	const downgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: `pro_${customerId}`,
		plan_schedule: "immediate",
		redirect_mode: "always",
	});
	console.log("Entity 2 downgrade result:", downgradeResult);

	const customerAfter = await autumnV1.customers.get(customerId);
	console.log("Customer after entity 2 immediate downgrade:", {
		products: customerAfter.products?.map(
			(p: { id: string; name: string | null; status: string }) => ({
				id: p.id,
				name: p.name,
				status: p.status,
			}),
		),
	});
});
