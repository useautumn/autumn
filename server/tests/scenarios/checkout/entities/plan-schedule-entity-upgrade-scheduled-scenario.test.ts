import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Plan Schedule: Entity Upgrade with Scheduled Override
 *
 * Demonstrates forcing a scheduled upgrade for an entity joining an existing subscription.
 * Entity 1 is on Pro. Entity 2 upgrades to Premium with plan_schedule: "end_of_cycle".
 * The upgrade is scheduled for end of cycle instead of happening immediately.
 *
 * This is useful when you want entities to upgrade together at cycle boundaries
 * rather than having prorated mid-cycle charges.
 */

test(`${chalk.yellowBright("plan_schedule: entity upgrade with end_of_cycle override")}`, async () => {
	const customerId = "plan-schedule-entity-upgrade";

	// Pro plan ($20/mo)
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

	// Premium plan ($50/mo)
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

	// Setup: customer with payment method, 2 entities, entity 1 on pro
	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [s.attach({ productId: "pro", entityIndex: 0 })],
	});

	// Get customer state with entity 1 on Pro
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

	// 1. Preview entity 2 upgrade to premium with plan_schedule: "end_of_cycle"
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

	// 2. Perform entity 2 upgrade with plan_schedule: "end_of_cycle" and redirect_mode: "always" (Autumn checkout URL)
	const upgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		entity_id: entities[1].id,
		product_id: `premium_${customerId}`,
		plan_schedule: "end_of_cycle",
		redirect_mode: "always",
	});
	console.log("Entity 2 upgrade result:", upgradeResult);

	// Get customer state after - entity 2's premium should be scheduled
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
