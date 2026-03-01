/**
 * Stripe Checkout Invoice Line Items Tests
 *
 * Tests for verifying that invoice line items are correctly persisted to the database
 * when attaching products via Stripe Checkout flow (no payment method → checkout page).
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3, ApiEntityV0 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectInvoiceLineItemsCorrect } from "@tests/integration/billing/utils/expectInvoiceLineItemsCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Checkout with prepaid + allocated + base price - verify all line items
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Attach pro ($20/mo) with:
 *   - Prepaid messages (100 included, $10/100 units) - purchase 400 total (3 paid packs)
 *   - Allocated users (3 included, $10/seat) - 5 entities = 2 overage seats
 * - Complete Stripe Checkout
 *
 * Expected Result:
 * - Invoice created with total: $20 + $30 (prepaid) + $20 (allocated) = $70
 * - Line items persisted to DB:
 *   - Base price ($20)
 *   - Prepaid messages ($30 = 3 packs × $10, totalQty=400, paidQty=300)
 *   - Allocated users overage ($20 = 2 seats × $10, totalQty=5, paidQty=2)
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout-line-items 1: prepaid + allocated + base price")}`, async () => {
	const customerId = "checkout-li-prepaid-allocated";

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 100,
		billingUnits: 100,
		price: 10,
	});
	const allocatedUsers = items.allocatedUsers({ includedUsage: 3 });

	const messagesQuantity = 400; // 100 included + 300 prepaid (3 packs)
	const prepaidPrice = 30; // 3 packs × $10
	const allocatedPrice = 20; // 2 overage seats × $10
	const basePrice = 20;
	const expectedTotal = basePrice + prepaidPrice + allocatedPrice; // $70

	const pro = products.pro({
		id: "pro-checkout-li",
		items: [prepaidMessages, allocatedUsers],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method - triggers checkout
			s.products({ list: [pro] }),
			s.entities({ count: 5, featureId: TestFeature.Users }), // 5 users, 2 over included
		],
		actions: [],
	});

	// 1. Preview attach
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: messagesQuantity }],
	});
	expect(preview.total).toBe(expectedTotal);

	// 2. Attach - returns payment_url (checkout mode)
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		options: [{ feature_id: TestFeature.Messages, quantity: messagesQuantity }],
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// 3. Complete checkout
	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	// 4. Verify product attached and features correct
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		balance: messagesQuantity,
	});

	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		usage: 5,
	});

	// 5. Verify invoice total
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	// 6. Get the stripe invoice ID from the customer's latest invoice
	const latestInvoice = customer.invoices?.[0];
	expect(latestInvoice?.stripe_id).toBeDefined();

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify invoice line items are persisted to DB
	// ═══════════════════════════════════════════════════════════════════════════════

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: latestInvoice!.stripe_id,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			// Base price ($20)
			{ isBasePrice: true, amount: basePrice },
			// Prepaid messages (3 packs × $10 = $30, 400 total, 300 paid)
			{
				featureId: TestFeature.Messages,
				totalAmount: prepaidPrice,
				billingTiming: "in_advance",
				totalQuantity: 400,
				paidQuantity: 300,
			},
			// Allocated users overage (2 seats × $10 = $20, 5 total, 2 overage)
			{
				featureId: TestFeature.Users,
				totalAmount: allocatedPrice,
				totalQuantity: 5,
				paidQuantity: 2,
			},
		],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Entity-level checkout with prepaid + allocated - verify line items
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Create 2 entities
 * - Attach pro to entity-1 with:
 *   - Prepaid messages (50 included, $5/50 units) - purchase 200 total (3 paid packs)
 *   - Allocated users (2 included, $15/seat) - entity-level, no extra entities
 * - Complete Stripe Checkout
 *
 * Expected Result:
 * - Entity-1 has product attached
 * - Entity-2 does NOT have product (isolation)
 * - Invoice line items persisted with correct entity association
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout-line-items 2: entity-level attach with prepaid")}`, async () => {
	const customerId = "checkout-li-entity-prepaid";

	const prepaidMessages = items.prepaidMessages({
		includedUsage: 50,
		billingUnits: 50,
		price: 5,
	});
	const allocatedUsers = items.allocatedUsers({ includedUsage: 2 });

	const messagesQuantity = 200; // 50 included + 150 prepaid (3 packs)
	const prepaidPrice = 15; // 3 packs × $5
	const basePrice = 20;
	const expectedTotal = basePrice + prepaidPrice; // $35 (no allocated overage)

	const pro = products.pro({
		id: "pro-entity-checkout-li",
		items: [prepaidMessages, allocatedUsers],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method
			s.products({ list: [pro] }),
			s.entities({ count: 2, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	const entity1Id = entities[0].id;
	const entity2Id = entities[1].id;

	// 1. Preview attach to entity-1
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entity1Id,
		options: [{ feature_id: TestFeature.Messages, quantity: messagesQuantity }],
	});
	expect(preview.total).toBe(expectedTotal);

	// 2. Attach to entity-1 - returns checkout URL
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entity1Id,
		options: [{ feature_id: TestFeature.Messages, quantity: messagesQuantity }],
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

	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: messagesQuantity,
	});

	// 5. Verify entity-2 does NOT have the product (isolation)
	const entity2 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity2Id,
	);
	expect(entity2.products?.length ?? 0).toBe(0);

	// 6. Verify invoice on customer
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	const latestInvoice = customer.invoices?.[0];
	expect(latestInvoice?.stripe_id).toBeDefined();

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify invoice line items are persisted to DB
	// ═══════════════════════════════════════════════════════════════════════════════

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: latestInvoice!.stripe_id,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			// Base price ($20)
			{ isBasePrice: true, amount: basePrice },
			// Prepaid messages (3 packs × $5 = $15, 200 total, 150 paid)
			{
				featureId: TestFeature.Messages,
				totalAmount: prepaidPrice,
				billingTiming: "in_advance",
				totalQuantity: 200,
				paidQuantity: 150,
			},
		],
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Entity-level checkout with allocated overage - verify line items
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Create 5 entities for users feature
 * - Attach pro to entity-1 with:
 *   - Monthly messages (100 included)
 *   - Allocated users (3 included, $10/seat) - 5 entities = 2 overage seats
 * - Complete Stripe Checkout
 *
 * Expected Result:
 * - Invoice: $20 base + $20 allocated = $40
 * - Line items include allocated overage charge with correct quantities
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout-line-items 3: entity checkout with allocated overage")}`, async () => {
	const customerId = "checkout-li-entity-allocated";

	const monthlyMessages = items.monthlyMessages({ includedUsage: 100 });
	const allocatedUsers = items.allocatedUsers({ includedUsage: 3 });

	const allocatedPrice = 20; // 2 overage seats × $10
	const basePrice = 20;
	const expectedTotal = basePrice + allocatedPrice; // $40

	const pro = products.pro({
		id: "pro-entity-allocated-li",
		items: [monthlyMessages, allocatedUsers],
	});

	const { autumnV1, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method
			s.products({ list: [pro] }),
			s.entities({ count: 5, featureId: TestFeature.Users }), // 5 entities, 2 over included
		],
		actions: [],
	});

	const entity1Id = entities[0].id;

	// 1. Attach to entity-1
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entity1Id,
	});

	expect(result.payment_url).toBeDefined();

	// 2. Complete checkout
	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	// 3. Verify entity-1 has product
	const entity1 = await autumnV1.entities.get<ApiEntityV0>(
		customerId,
		entity1Id,
	);

	await expectProductActive({
		customer: entity1,
		productId: pro.id,
	});

	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Messages,
		balance: 100,
	});

	expectCustomerFeatureCorrect({
		customer: entity1,
		featureId: TestFeature.Users,
		usage: 5,
	});

	// 4. Verify invoice
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	const latestInvoice = customer.invoices?.[0];
	expect(latestInvoice?.stripe_id).toBeDefined();

	// ═══════════════════════════════════════════════════════════════════════════════
	// KEY TEST: Verify invoice line items are persisted to DB
	// ═══════════════════════════════════════════════════════════════════════════════

	await expectInvoiceLineItemsCorrect({
		stripeInvoiceId: latestInvoice!.stripe_id,
		expectedTotal,
		allCharges: true,
		expectedLineItems: [
			// Base price ($20)
			{ isBasePrice: true, amount: basePrice },
			// Allocated users overage (2 seats × $10 = $20, 5 total, 2 overage)
			{
				featureId: TestFeature.Users,
				totalAmount: allocatedPrice,
				totalQuantity: 5,
				paidQuantity: 2,
			},
		],
	});
});
