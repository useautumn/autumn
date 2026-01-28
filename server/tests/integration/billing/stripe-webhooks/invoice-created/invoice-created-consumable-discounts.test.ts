/**
 * Invoice Created Webhook Tests - Consumable Discounts
 *
 * Tests that verify discounts are correctly applied to consumable (usage-in-arrear)
 * overage charges during billing cycle renewals.
 *
 * Key behaviors tested:
 * - Customer-level discounts apply to all consumable overages
 * - Subscription-level discounts apply to all consumable overages
 * - Product-specific discounts (applies_to.products) only apply to matching products
 * - Discounts are calculated by Autumn before creating invoice items (discountable: false on Stripe)
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	applyCustomerDiscount,
	applySubscriptionDiscount,
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { ProductService } from "@/internal/products/ProductService";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Customer-level discount applies to consumable overage
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with consumable messages (100 included, $0.10/unit overage)
 * - Pro has a $20/month base price
 * - Apply 20% customer-level discount (applies to all subscriptions)
 * - Track 200 messages (100 overage)
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Initial invoice: $20 * 0.8 = $16 (base with discount)
 * - Renewal invoice: $16 base + ($10 overage * 0.8) = $16 + $8 = $24
 * - Discount applies to both base price AND overage
 */
test.concurrent(`${chalk.yellowBright("invoice.created discount: customer-level discount applies to consumable overage")}`, async () => {
	const customerId = "inv-disc-cus-level";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Apply customer-level discount (20% off)
	const { stripeCli, stripeCustomerId } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
	});

	await applyCustomerDiscount({
		stripeCli,
		customerId: stripeCustomerId,
		couponId: coupon.id,
	});

	// Track 200 messages (100 overage = $10 before discount)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 200,
	});

	// Verify usage tracked
	const customerAfterTrack =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterTrack.features[TestFeature.Messages].balance).toBe(-100);

	// Advance to next billing cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		withPause: true,
	});

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Calculate expected amounts
	// Base price: $20 * 0.8 = $16
	// Overage: 100 * $0.10 * 0.8 = $8
	// Total: $16 + $8 = $24
	const discountMultiplier = 0.8;
	const basePrice = 20;
	const overageAmount = 100 * 0.1; // 100 units * $0.10
	const expectedTotal = Math.round(
		basePrice * discountMultiplier + overageAmount * discountMultiplier,
	);

	// Should have 2 invoices
	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 2,
		latestTotal: expectedTotal,
		latestInvoiceProductId: pro.id,
	});

	// Balance should be reset to 100 (included usage)
	expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(100);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Subscription-level discount applies to consumable overage
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with consumable messages (100 included, $0.10/unit overage)
 * - Pro has a $20/month base price
 * - Apply 25% subscription-level discount
 * - Track 300 messages (200 overage)
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Renewal invoice: ($20 base + $20 overage) * 0.75 = $30
 * - Discount applies to both base price AND overage
 */
test.concurrent(`${chalk.yellowBright("invoice.created discount: subscription-level discount applies to consumable overage")}`, async () => {
	const customerId = "inv-disc-sub-level";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Apply subscription-level discount (25% off)
	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 25,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [coupon.id],
	});

	// Track 300 messages (200 overage = $20 before discount)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 300,
	});

	// Verify usage tracked
	const customerAfterTrack =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterTrack.features[TestFeature.Messages].balance).toBe(-200);

	// Advance to next billing cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		withPause: true,
	});

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Calculate expected amounts
	// Base price: $20 * 0.75 = $15
	// Overage: 200 * $0.10 * 0.75 = $15
	// Total: $15 + $15 = $30
	const discountMultiplier = 0.75;
	const basePrice = 20;
	const overageAmount = 200 * 0.1; // 200 units * $0.10
	const expectedTotal = Math.round(
		basePrice * discountMultiplier + overageAmount * discountMultiplier,
	);

	// Should have 2 invoices
	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 2,
		latestTotal: expectedTotal,
		latestInvoiceProductId: pro.id,
	});

	// Balance should be reset to 100 (included usage)
	expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(100);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Discount on base price only does NOT apply to consumable overage
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with consumable messages (100 included, $0.10/unit overage)
 * - Pro has a $20/month base price
 * - Apply 50% discount that only applies to the BASE PRICE Stripe product
 * - Track 200 messages (100 overage)
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Renewal invoice: ($20 base * 0.5) + $10 overage = $10 + $10 = $20
 * - Discount does NOT apply to overage (different Stripe product)
 */
test.concurrent(`${chalk.yellowBright("invoice.created discount: base price only discount does NOT apply to consumable")}`, async () => {
	const customerId = "inv-disc-base-only";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Get subscription for applying discount
	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	// Get the product's processor ID (used for base price line items)
	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		idOrInternalId: pro.id,
	});

	const basePriceProductId = fullProduct?.processor?.id;
	if (!basePriceProductId) {
		throw new Error("Could not find base price Stripe product ID");
	}

	// Create coupon that ONLY applies to the base price product (product.processor.id)
	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 50,
		appliesToProducts: [basePriceProductId],
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [coupon.id],
	});

	// Track 200 messages (100 overage = $10)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 200,
	});

	// Verify usage tracked
	const customerAfterTrack =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterTrack.features[TestFeature.Messages].balance).toBe(-100);

	// Advance to next billing cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		withPause: true,
	});

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Calculate expected amounts
	// Base price: $20 * 0.5 = $10 (discounted)
	// Overage: 100 * $0.10 = $10 (NOT discounted - different product)
	// Total: $10 + $10 = $20
	const discountedBase = 20 * 0.5;
	const overageAmount = 100 * 0.1; // No discount applied
	const expectedTotal = discountedBase + overageAmount;

	// Should have 2 invoices
	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 2,
		latestTotal: expectedTotal,
		latestInvoiceProductId: pro.id,
	});

	// Balance should be reset to 100 (included usage)
	expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(100);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Discount on consumable price only applies to overage
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro with consumable messages (100 included, $0.10/unit overage)
 * - Pro has a $20/month base price
 * - Apply 50% discount that only applies to the CONSUMABLE Stripe product
 * - Track 200 messages (100 overage)
 * - Advance to next billing cycle
 *
 * Expected Result:
 * - Renewal invoice: $20 base + ($10 overage * 0.5) = $20 + $5 = $25
 * - Discount ONLY applies to overage (matching Stripe product)
 */
test.concurrent(`${chalk.yellowBright("invoice.created discount: consumable price only discount applies to overage")}`, async () => {
	const customerId = "inv-disc-cons-only";

	const consumableItem = items.consumableMessages({ includedUsage: 100 });
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Get subscription for applying discount
	const { stripeCli, subscription } = await getStripeSubscription({
		customerId,
	});

	// Get the consumable price's stripe_product_id from the product config
	const fullProduct = await ProductService.getFull({
		db: ctx.db,
		orgId: ctx.org.id,
		env: ctx.env,
		idOrInternalId: pro.id,
	});

	// Find the consumable price and get its stripe_product_id
	const consumablePrice = fullProduct?.prices.find(
		(price) => price.config?.stripe_product_id,
	);

	const consumableProductId = consumablePrice?.config?.stripe_product_id;
	if (!consumableProductId) {
		throw new Error("Could not find consumable Stripe product ID");
	}

	// Create coupon that ONLY applies to the consumable product (price.config.stripe_product_id)
	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 50,
		appliesToProducts: [consumableProductId],
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subscription.id,
		couponIds: [coupon.id],
	});

	// Track 200 messages (100 overage = $10 before discount)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 200,
	});

	// Verify usage tracked
	const customerAfterTrack =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	expect(customerAfterTrack.features[TestFeature.Messages].balance).toBe(-100);

	// Advance to next billing cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		withPause: true,
	});

	const customerAfterAdvance =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Calculate expected amounts
	// Base price: $20 (NOT discounted - doesn't match coupon's applies_to)
	// Overage: 100 * $0.10 * 0.5 = $5 (discounted)
	// Total: $20 + $5 = $25
	const basePrice = 20; // No discount
	const discountedOverage = 100 * 0.1 * 0.5;
	const expectedTotal = basePrice + discountedOverage;

	// Should have 2 invoices
	expectCustomerInvoiceCorrect({
		customer: customerAfterAdvance,
		count: 2,
		latestTotal: expectedTotal,
		latestInvoiceProductId: pro.id,
	});

	// Balance should be reset to 100 (included usage)
	expect(customerAfterAdvance.features[TestFeature.Messages].balance).toBe(100);
});
