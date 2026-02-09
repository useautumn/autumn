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
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutForm } from "@tests/utils/browserPool";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
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
			s.entities({ count: 2, featureId: TestFeature.Users }), // Create 2 entities to verify isolation
		],
		actions: [],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	// 1. Preview attach to entity-1 - should show $20
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entity1Id,
	});
	expect(preview.total).toBe(20);

	// 2. Attempt attach to entity-1 - should return payment_url
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entity1Id,
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// 3. Complete checkout
	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	// 4. Verify entity-1 has product attached
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);

	await expectProductActive({
		customer: entity1,
		productId: pro.id,
	});

	// Verify messages feature on entity-1
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// 5. Verify entity-2 does NOT have the product (isolation check)
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	expect(entity2.products?.length ?? 0).toBe(0);

	// Verify invoice on customer
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
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
			s.entities({ count: 2, featureId: TestFeature.Users }), // Create 2 entities to verify isolation
		],
		actions: [],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	// 1. Preview attach to entity-1 - should show $20 (base price only, consumable billed in arrears)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entity1Id,
	});
	expect(preview.total).toBe(20);

	// 2. Attempt attach to entity-1 - should return payment_url
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entity1Id,
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// 3. Complete checkout
	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	// 4. Verify entity-1 has product attached
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);

	await expectProductActive({
		customer: entity1,
		productId: pro.id,
	});

	// 5. Verify consumable messages feature on entity-1
	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// 6. Verify entity-2 does NOT have the product (isolation check)
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	expect(entity2.products?.length ?? 0).toBe(0);

	// 7. Verify invoice on customer (base price only)
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});
});
