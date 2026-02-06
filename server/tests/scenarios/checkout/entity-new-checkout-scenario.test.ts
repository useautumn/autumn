import { test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Entity New Checkout Scenario
 *
 * Tests attaching a product to a new entity when another entity already has a plan.
 * Customer has pro on entity-1, then attaches pro to entity-2 (new entity).
 */

test(`${chalk.yellowBright("checkout: entity - pro on entity-1, checkout pro to entity-2")}`, async () => {
	const customerId = "entity-new-checkout";

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

	// Setup: customer with payment method and 2 entities, pro attached to entity-1
	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// Attach pro plan to entity-1 first
			s.attach({ productId: "pro", entityIndex: 0 }),
		],
	});

	// Get customer state after initial attach
	const customerBefore = await autumnV1.customers.get(customerId);
	console.log("customer before new entity checkout:", {
		products: customerBefore.products?.map(
			(p: { id: string; name: string | null }) => ({
				id: p.id,
				name: p.name,
			}),
		),
		entities: entities.map((e) => ({ id: e.id, name: e.name })),
	});

	// 1. Preview attaching pro to entity-2
	const checkoutPreview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		entity_id: entities[1].id, // ent-2
		redirect_mode: "always",
	});
	console.log("new entity checkout preview:", checkoutPreview);

	// 2. Attach pro to entity-2 with redirect_mode: "always" (Autumn checkout URL)
	const checkoutResult = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: `pro_${customerId}`,
		entity_id: entities[1].id, // ent-2
		redirect_mode: "always",
	});
	console.log("new entity checkout result:", checkoutResult);
});
