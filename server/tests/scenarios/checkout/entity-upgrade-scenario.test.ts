import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Entity Upgrade Scenario
 *
 * Tests upgrading a specific entity's plan while another entity keeps its current plan.
 * Customer has pro on both entities, then upgrades entity-2 to premium.
 */

test(`${chalk.yellowBright("attach: entity - pro on both entities, upgrade entity-2 to premium")}`, async () => {
	const customerId = "entity-upgrade";

	// Pro plan ($20/mo) - standard features
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

	// Premium plan ($50/mo) - more features, higher limits
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

	// Setup: customer with payment method and 2 entities, pro attached to both
	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// Attach pro plan to both entities
			s.attach({ productId: "pro", entityIndex: 0 }),
			s.attach({ productId: "pro", entityIndex: 1 }),
		],
	});

	// Get customer state after initial attaches
	const customerBefore = await autumnV1.customers.get(customerId);
	console.log("customer before entity upgrade:", {
		products: customerBefore.products?.map(
			(p: { id: string; name: string | null }) => ({
				id: p.id,
				name: p.name,
			}),
		),
		entities: entities.map((e) => ({ id: e.id, name: e.name })),
	});

	// Options for prepaid features in premium plan
	const premiumOptions = [{ feature_id: TestFeature.Users, quantity: 10 }];

	// 1. Preview upgrading entity-2 to premium
	const upgradePreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `premium_${customerId}`,
		entity_id: entities[1].id, // ent-2
		options: premiumOptions,
		redirect_mode: "always",
	});
	console.log("entity upgrade preview:", upgradePreview);

	// 2. Upgrade entity-2 to premium with redirect_mode: "always" (Autumn checkout URL)
	const upgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `premium_${customerId}`,
		entity_id: entities[1].id, // ent-2
		redirect_mode: "always",
		options: premiumOptions,
	});
	console.log("entity upgrade result:", upgradeResult);
});
