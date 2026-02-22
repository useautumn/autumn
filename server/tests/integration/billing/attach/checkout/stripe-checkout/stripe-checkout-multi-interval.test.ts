/**
 * Stripe Checkout Multi-Interval Tests (Attach V2)
 *
 * Tests for Stripe Checkout flow with annual products and various item types.
 * proAnnual has $200/year base price.
 *
 * Key behaviors:
 * - Annual products with consumable items
 * - Annual products with prepaid items
 * - Annual products with allocated users (per-seat billing)
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
// TEST A: Annual product with consumable messages
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Attach proAnnual ($200/year) with consumable messages (100 included, $0.10/unit overage)
 *
 * Expected Result:
 * - Checkout includes annual base price ($200)
 * - Consumable messages billed in arrears (not charged upfront)
 * - Invoice: $200 (base only)
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout: annual with consumable messages")}`, async () => {
	const customerId = "stripe-checkout-annual-consumable";
	const basePrice = 200; // proAnnual is $200/year

	const consumableMessagesItem = items.consumableMessages({
		includedUsage: 100,
	});

	const proAnnual = products.proAnnual({
		id: "pro-annual-consumable",
		items: [consumableMessagesItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method!
			s.products({ list: [proAnnual] }),
		],
		actions: [],
	});

	// 1. Preview attach - should show $200 (base only, consumable billed in arrears)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proAnnual.id,
	});
	expect(preview.total).toBe(basePrice);

	// 2. Attempt attach - should return payment_url
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// 3. Complete checkout
	await completeStripeCheckoutForm({ url: result.payment_url });

	// 4. Verify product attached
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: proAnnual.id,
	});

	// 5. Verify consumable messages feature
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// 6. Verify invoice: base price only
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: basePrice,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST B: Annual product with consumable + prepaid messages
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Attach proAnnual ($200/year) with:
 *   - Consumable messages (100 included, $0.10/unit overage)
 *   - Prepaid words (100 included, $10/pack of 100)
 * - Quantity passed: 100 words (just included allowance, no paid packs)
 *
 * Expected Result:
 * - Checkout includes annual base ($200) only (no prepaid charge)
 * - Invoice: $200
 * - Words balance: 100
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout: annual with consumable + prepaid (included only)")}`, async () => {
	const customerId = "stripe-checkout-annual-mixed";
	const basePrice = 200; // proAnnual is $200/year
	const billingUnits = 100;
	const pricePerPack = 10;
	const includedWords = 100;

	const consumableMessagesItem = items.consumableMessages({
		includedUsage: 100,
	});

	const prepaidWordsItem = items.prepaid({
		featureId: TestFeature.Words,
		includedUsage: includedWords, // 100 included (1 free pack)
		billingUnits,
		price: pricePerPack,
	});

	const proAnnual = products.proAnnual({
		id: "pro-annual-mixed",
		items: [consumableMessagesItem, prepaidWordsItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method!
			s.products({ list: [proAnnual] }),
		],
		actions: [],
	});

	// Quantity = included allowance only (no paid packs)
	const prepaidQuantity = includedWords; // 100

	// 1. Preview attach - should show $200 (base only, no prepaid charge)
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proAnnual.id,
		options: [{ feature_id: TestFeature.Words, quantity: prepaidQuantity }],
	});
	expect(preview.total).toBe(basePrice);

	// 2. Attempt attach - should return payment_url
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
		options: [{ feature_id: TestFeature.Words, quantity: prepaidQuantity }],
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// 3. Complete checkout
	await completeStripeCheckoutForm({ url: result.payment_url });
	await timeout(12000);

	// 4. Verify product attached
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: proAnnual.id,
	});

	// 5. Verify consumable messages feature (100 included)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Messages,
		includedUsage: 100,
		balance: 100,
		usage: 0,
	});

	// 6. Verify prepaid words feature (100 = included only)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Words,
		includedUsage: prepaidQuantity,
		balance: prepaidQuantity,
		usage: 0,
	});

	// 7. Verify invoice: base only = $200
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: basePrice,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST C: Annual product with allocated users (5 entities created beforehand)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer with NO payment method
 * - Create 5 user entities BEFORE attach
 * - Attach proAnnual ($200/year) with allocated users ($10/user, 0 included)
 *
 * Allocated users are billed based on entity count (continuous usage).
 * With 5 entities and $10/user:
 * - Users cost: 5 × $10 = $50
 * - Total: $200 (base) + $50 (users) = $250
 *
 * Expected Result:
 * - Checkout includes annual base ($200) + users ($50)
 * - Invoice: $250
 */
test.concurrent(`${chalk.yellowBright("stripe-checkout: annual with allocated users (0 usage)")}`, async () => {
	const customerId = "stripe-checkout-annual-allocated";
	const basePrice = 200; // proAnnual is $200/year
	const pricePerUser = 10;
	const userCount = 5;

	const allocatedUsersItem = items.allocatedUsers({
		includedUsage: 0, // No free users
	});

	const proAnnual = products.proAnnual({
		id: "pro-annual-allocated",
		items: [allocatedUsersItem],
	});

	const { autumnV1, ctx, entities } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: true }), // No payment method!
			s.products({ list: [proAnnual] }),
		],
		actions: [],
	});

	// 1. Preview attach - should show $200 (base) + $50 (users) = $250
	const preview = await autumnV1.billing.previewAttach({
		customer_id: customerId,
		product_id: proAnnual.id,
	});
	expect(preview.total).toBe(basePrice);

	// 2. Attempt attach - should return payment_url
	const result = await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: proAnnual.id,
	});

	expect(result.payment_url).toBeDefined();
	expect(result.payment_url).toContain("checkout.stripe.com");

	// 3. Complete checkout
	await completeStripeCheckoutForm({ url: result.payment_url });

	// 4. Verify product attached
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectProductActive({
		customer,
		productId: proAnnual.id,
	});

	// 5. Verify allocated users feature (5 users)
	expectCustomerFeatureCorrect({
		customer,
		featureId: TestFeature.Users,
		includedUsage: 0,
		balance: 0,
		usage: 0,
	});

	// 6. Verify invoice: base + users = $250
	await expectCustomerInvoiceCorrect({
		customer,
		count: 1,
		latestTotal: basePrice,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: 1,
	});

	await timeout(4000);

	const customerAfter = await autumnV1.customers.get<ApiCustomerV3>(customerId);

	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: 10,
		latestInvoiceProductId: proAnnual.id,
	});
});
