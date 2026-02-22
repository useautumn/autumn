/**
 * Stripe Checkout Basic Tests (Attach V2)
 *
 * Tests for Stripe Checkout flow when customer has NO payment method.
 * When checkoutMode = "stripe_checkout", attach returns a payment_url
 * that the customer uses to complete payment.
 *
 * Key behaviors:
 * - No payment method → triggers stripe_checkout mode
 * - Returns payment_url instead of charging directly
 * - Product is attached after checkout completion
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductActive } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { completeStripeCheckoutFormV2 as completeStripeCheckoutForm } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Pro with allocated users via checkout
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Attach pro product with allocated users (5 included, $10/seat)
 *
 * Expected Result:
 * - Returns payment_url
 * - Preview shows: $20 base (no usage tracked yet)
 * - After checkout: 5 users balance (included usage)
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout allocated: pro with allocated users (no usage)")}`, async () => {
	const customerId = "stripe-checkout-allocated-users";

	// Allocated users: 5 included, $10/seat for additional (prorated billing)
	const allocatedUsersItem = items.allocatedUsers({ includedUsage: 0 });
	const pro = products.pro({
		id: "pro-allocated-checkout",
		items: [allocatedUsersItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method!
			s.products({ list: [pro] }),
		],
		actions: [],
	});

	// 1. Preview attach - should show $20 (base price only, no usage tracked yet)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
	});
	expect(preview.total).toBe(20);

	// 2. Attempt attach - should return payment_url
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// 3. Complete checkout form
	await completeStripeCheckoutForm({ url: result.payment_url });

	// 4. Verify product is now attached
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	// Verify users feature - should have 5 balance (included usage)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 0,
		balance: 0,
		usage: 0,
	});

	// Verify invoice was paid (base price only)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: 20,
	});

	// Try tracking 1 user
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 1,
	});

	await timeout(5000);

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify invoice was paid (base price only)
	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: 10,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Pro with allocated users and pre-existing entities via checkout
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Create 3 entities (users) BEFORE attaching
 * - Attach pro product with allocated users (0 included, $10/seat)
 *
 * Expected Result:
 * - Returns payment_url
 * - Preview shows: $20 base + 3 × $10 = $50
 * - After checkout: 3 users balance (from entities)
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout allocated: pro with pre-existing entities")}`, async () => {
	const customerId = "stripe-checkout-allocated-entities";

	// Allocated users: 0 included, $10/seat
	const allocatedUsersItem = items.allocatedUsers({ includedUsage: 0 });
	const pro = products.pro({
		id: "pro-allocated-entities-checkout",
		items: [allocatedUsersItem],
	});

	const entityCount = 3;
	const pricePerSeat = 10;
	const basePrice = 20;
	const expectedTotal = basePrice + entityCount * pricePerSeat; // $50

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method!
			s.products({ list: [pro] }),
			s.entities({ count: entityCount, featureId: TestFeature.Users }),
		],
		actions: [],
	});

	// Verify 3 entities were created
	expect(entities.length).toBe(entityCount);

	// 1. Preview attach - should show $50 (base + 3 seats)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: pro.id,
	});
	expect(preview.total).toBe(expectedTotal);

	// 2. Attempt attach - should return payment_url
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// 3. Complete checkout form
	await completeStripeCheckoutForm({ url: result.payment_url });

	// 4. Verify product is now attached
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: pro.id,
	});

	// Verify users feature - should have 3 balance (from entities)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 0,
		balance: -entityCount,
		usage: entityCount,
	});

	// Verify invoice was paid (base + 3 seats = $50)
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: expectedTotal,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
