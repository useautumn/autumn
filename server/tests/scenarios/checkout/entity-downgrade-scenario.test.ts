import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Entity Downgrade Scenario
 *
 * Tests downgrading a specific entity's plan while another entity keeps its current plan.
 * Customer has premium on both entities, then downgrades entity-2 to pro (scheduled).
 */

test(`${chalk.yellowBright("attach: entity downgrade - premium on both, downgrade entity-2 to pro")}`, async () => {
	const customerId = "entity-downgrade";

	// Premium plan ($50/mo) - top tier features
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

	// Pro plan ($20/mo) - mid tier features
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

	// Setup: customer with payment method, 2 entities, premium attached to both
	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premium, pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// Attach premium plan to both entities
			s.attach({ productId: "premium", entityIndex: 0 }),
			s.attach({ productId: "premium", entityIndex: 1 }),
		],
	});

	// Get customer state after initial attaches
	const customerBefore = await autumnV1.customers.get(customerId);
	console.log("customer before entity downgrade:", {
		products: customerBefore.products?.map(
			(p: { id: string; name: string | null }) => ({
				id: p.id,
				name: p.name,
			}),
		),
		entities: entities.map((e) => ({ id: e.id, name: e.name })),
	});

	// 1. Preview downgrading entity-2 to pro (will be scheduled for end of cycle)
	const downgradePreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		entity_id: entities[1].id, // ent-2
		redirect_mode: "always",
	});
	console.log("entity downgrade preview:", downgradePreview);

	// 2. Downgrade entity-2 to pro (automatically scheduled for end of cycle)
	const downgradeResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		entity_id: entities[1].id, // ent-2
		redirect_mode: "always",
	});
	console.log("entity downgrade result:", downgradeResult);

	// Get customer state after scheduled downgrade
	const customerAfter = await autumnV1.customers.get(customerId);
	console.log("customer after entity downgrade:", {
		products: customerAfter.products?.map(
			(p: { id: string; name: string | null }) => ({
				id: p.id,
				name: p.name,
			}),
		),
	});
});
