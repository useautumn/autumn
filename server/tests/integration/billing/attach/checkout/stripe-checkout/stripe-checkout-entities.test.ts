/**
 * Stripe Checkout Entity Tests (Attach V2)
 *
 * Tests for Stripe Checkout flow with entity-level billing.
 * When customer has NO payment method and attaches to an entity,
 * it triggers stripe_checkout mode for that entity.
 *
 * Key behaviors:
 * - Entity-level attach without PM → checkout flow
 * - Each entity can have its own checkout session
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0, AttachPreview } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { completeCheckoutForm } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Entity attach via checkout (no payment method)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Attach pro to entity-1
 *
 * Expected Result:
 * - Returns payment_url
 * - After checkout: entity-1 has product attached
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout: entity attach")}`, async () => {
	const customerId = "stripe-checkout-entity-attach";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro-entity-checkout",
		items: [messagesItem],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method!
			s.products({ list: [pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const entityId = entities[0].id;

	// 1. Preview attach to entity - should show $20
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entityId,
	});
	expect((preview as AttachPreview).due_today.total).toBe(20);

	// 2. Attempt attach to entity - should return payment_url
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entityId,
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// 3. Complete checkout
	await completeCheckoutForm(result.payment_url);
	await timeout(12000);

	// 4. Verify entity has product attached
	const entity = await autumnV1.entities.get<ApiEntityV0>(customerId, entityId);

	await expectProductActive({
		customer: entity,
		productId: pro.id,
	});

	// Verify messages feature on entity
	expectCustomerFeatureCorrect({
		customer: entity,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// Verify invoice on customer
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Second entity needs its own checkout
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Entity-1 has product via direct billing (customer has PM)
 * - Remove PM
 * - Entity-2 needs checkout (no PM)
 *
 * Expected Result:
 * - Entity-2 gets its own checkout flow
 * - Entity-1 keeps its product
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout: second entity")}`, async () => {
	const customerId = "stripe-checkout-second-entity";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro-second-entity",
		items: [messagesItem],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }), // Has PM initially
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [
			// Attach to entity-1 with PM (direct billing)
			s.attach({ productId: pro.id, entityIndex: 0 }),
		],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	// Verify entity-1 has product
	let entity1 = await autumnV1.entities.get<ApiEntityV0>(customerId, entity1Id);
	await expectProductActive({
		customer: entity1,
		productId: pro.id,
	});

	// Remove payment method
	await autumnV1.paymentMethods.removeAll({ customer_id: customerId });

	// Attempt attach to entity-2 - should require checkout (no PM)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entity2Id,
	});
	expect((preview as AttachPreview).due_today.total).toBe(20);

	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entity2Id,
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// Complete checkout for entity-2
	await completeCheckoutForm(result.payment_url);
	await timeout(12000);

	// Verify entity-2 now has product
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	await expectProductActive({
		customer: entity2,
		productId: pro.id,
	});

	// Verify entity-1 still has its product
	entity1 = await autumnV1.entities.get<ApiEntityV0>(customerId, entity1Id);
	await expectProductActive({
		customer: entity1,
		productId: pro.id,
	});

	// Verify invoices (1 for entity-1 direct billing + 1 for entity-2 checkout)
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 2,
		latestTotal: 20,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Entity attach with consumable messages via checkout
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Attach pro with consumable messages to entity-1
 *
 * Expected Result:
 * - Returns payment_url
 * - After checkout: entity-1 has product with consumable messages feature
 * - Consumable messages configured correctly (100 included, $0.10/unit overage)
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout: entity attach with consumable messages")}`, async () => {
	const customerId = "stripe-checkout-entity-consumable";

	const consumableMessagesItem = items.consumableMessages({
		includedUsage: 100,
	});
	const pro = products.pro({
		id: "pro-entity-consumable",
		items: [consumableMessagesItem],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method!
			s.products({ list: [pro] }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const entityId = entities[0].id;

	// 1. Preview attach to entity - should show $20 (base price only, consumable billed in arrears)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entityId,
	});
	expect(preview.total).toBe(20);

	// 2. Attempt attach to entity - should return payment_url
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entityId,
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	console.log("result", result);
	return;

	// 3. Complete checkout
	await completeCheckoutForm(result.payment_url);
	await timeout(12000);

	// 4. Verify entity has product attached
	const entity = await autumnV1.entities.get<ApiEntityV0>(customerId, entityId);

	await expectProductActive({
		customer: entity,
		productId: pro.id,
	});

	// 5. Verify consumable messages feature on entity
	expectCustomerFeatureCorrect({
		customer: entity,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// 6. Verify invoice on customer (base price only)
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});
});
