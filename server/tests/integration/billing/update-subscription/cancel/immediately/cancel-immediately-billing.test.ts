/**
 * Cancel Immediately Billing Tests
 *
 * Tests for billing/invoicing when canceling subscriptions immediately.
 * Verifies preview.total matches actual invoices for:
 * - Base price + prepaid items
 * - Base price + allocated items
 * - Mid-cycle cancellations with exact proration calculations
 *
 * Note: Consumable features are tested in cancel-consumable.test.ts
 */

import { expect, test } from "bun:test";
import { type ApiCustomerV3, applyProration } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import {
	expectProductActive,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { Decimal } from "decimal.js";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Cancel immediately - base price + prepaid messages (start of cycle)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro ($20/mo) with 300 prepaid messages (3 packs * $10 = $30)
 * - Total initial charge: $50 ($20 base + $30 prepaid)
 * - Cancel immediately at start of cycle
 *
 * Expected Result:
 * - Preview total should be refund of ~$50 (prorated based on remaining cycle)
 * - At start of cycle, refund should be close to -$50
 * - Invoice should match preview.total
 */
test.concurrent(`${chalk.yellowBright("cancel immediately billing: base + prepaid (start of cycle)")}`, async () => {
	const customerId = "cancel-imm-billing-prepaid-start";

	const billingUnits = 100;
	const pricePerPack = 10;
	const initialQuantity = 300; // 3 packs

	const prepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits,
		price: pricePerPack,
	});

	const pro = products.pro({
		id: "pro",
		items: [prepaidItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity },
				],
			}),
		],
	});

	// Verify pro is active with correct balance
	const customerAfterAttach =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterAttach,
		productId: pro.id,
	});
	expect(customerAfterAttach.features[TestFeature.Messages].balance).toBe(
		initialQuantity,
	);

	// Initial invoice: $20 (base) + $30 (3 packs * $10) = $50
	const expectedInitialInvoice =
		20 + (initialQuantity / billingUnits) * pricePerPack;
	expectCustomerInvoiceCorrect({
		customer: customerAfterAttach,
		count: 1,
		latestTotal: expectedInitialInvoice,
	});

	// Preview cancel immediately
	const cancelParams = {
		customer_id: customerId,
		product_id: pro.id,
		cancel: "immediately" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

	// At start of cycle, refund should be close to full amount (negative)
	// Allow some tolerance for timing (within a few dollars of -$50)
	expect(preview.total).toBeLessThan(0);
	expect(preview.total).toBeCloseTo(-expectedInitialInvoice, -1); // Within ~$5

	// Cancel immediately
	await autumnV1.subscriptions.update(cancelParams);

	// Verify product is removed
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	// Verify invoice matches preview
	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 2,
		latestTotal: preview.total,
	});

	// Verify no Stripe subscription exists
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Cancel immediately - base price + allocated users (start of cycle)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro ($20/mo) with 5 allocated users (5 * $10 = $50)
 * - Total initial charge: $70 ($20 base + $50 allocated)
 * - Cancel immediately at start of cycle
 *
 * Expected Result:
 * - Preview total should be refund of ~$70 (prorated based on remaining cycle)
 * - At start of cycle, refund should be close to -$70
 * - Invoice should match preview.total
 */
test.concurrent(`${chalk.yellowBright("cancel immediately billing: base + allocated (start of cycle)")}`, async () => {
	const customerId = "cancel-imm-billing-allocated-start";

	const allocatedSeats = 5;

	const allocatedItem = items.allocatedUsers({
		includedUsage: 0, // No free seats
	});

	const pro = products.pro({
		id: "pro",
		items: [allocatedItem],
	});

	const { autumnV1, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	// Track 5 users (creates invoice for allocated overage)
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: allocatedSeats,
	});

	// Verify pro is active with correct balance
	const customerAfterTrack =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerAfterTrack,
		productId: pro.id,
	});
	expect(customerAfterTrack.features[TestFeature.Users].balance).toBe(
		-allocatedSeats,
	);

	// Should have 2 invoices: initial ($20) + allocated overage
	// Allocated track immediately creates invoice for overage seats
	expect(customerAfterTrack.invoices?.length).toBeGreaterThanOrEqual(1);

	// Preview cancel immediately
	const cancelParams = {
		customer_id: customerId,
		product_id: pro.id,
		cancel: "immediately" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

	// At start of cycle, should get refund (negative)
	expect(preview.total).toBeLessThan(0);

	// Cancel immediately
	await autumnV1.subscriptions.update(cancelParams);

	// Verify product is removed
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	// Verify latest invoice matches preview
	expect(customerAfterCancel.invoices?.[0]?.total).toBe(preview.total);

	// Verify no Stripe subscription exists
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Cancel immediately - base + prepaid (mid-cycle with exact proration)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro ($20/mo) with 500 prepaid messages (5 packs * $10 = $50)
 * - Total initial charge: $70 ($20 base + $50 prepaid)
 * - Advance 15 days (mid-cycle)
 * - Cancel immediately
 *
 * Expected Result:
 * - Preview total should be prorated refund for remaining ~15 days
 * - Exact calculation: -$70 * (remaining_days / total_days)
 * - Invoice should match preview.total
 */
test.concurrent(`${chalk.yellowBright("cancel immediately billing: base + prepaid (mid-cycle exact proration)")}`, async () => {
	const customerId = "cancel-imm-billing-prepaid-mid";

	const billingUnits = 100;
	const pricePerPack = 10;
	const initialQuantity = 500; // 5 packs
	const basePrice = 20;

	const prepaidItem = items.prepaidMessages({
		includedUsage: 0,
		billingUnits,
		price: pricePerPack,
	});

	const pro = products.pro({
		id: "pro",
		items: [prepaidItem],
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({
				productId: pro.id,
				options: [
					{ feature_id: TestFeature.Messages, quantity: initialQuantity },
				],
			}),
			s.advanceTestClock({ days: 15 }), // Mid-cycle
		],
	});

	// Verify pro is active
	const customerMidCycle =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductActive({
		customer: customerMidCycle,
		productId: pro.id,
	});

	// Get billing period for proration calculation
	const subscription = customerMidCycle.products?.[0];
	if (
		!subscription?.current_period_start ||
		!subscription?.current_period_end
	) {
		throw new Error("Missing billing period on subscription");
	}

	const billingPeriod = {
		start: subscription.current_period_start,
		end: subscription.current_period_end,
	};

	// Calculate expected prorated refund
	const frozenTimeMs = Math.floor(advancedTo! / 1000) * 1000;

	const prepaidAmount = (initialQuantity / billingUnits) * pricePerPack; // $50

	// Prorated refund for base price
	const proratedBaseRefund = applyProration({
		now: frozenTimeMs,
		billingPeriod,
		amount: basePrice,
	});

	// Prorated refund for prepaid
	const proratedPrepaidRefund = applyProration({
		now: frozenTimeMs,
		billingPeriod,
		amount: prepaidAmount,
	});

	const expectedRefund = new Decimal(-proratedBaseRefund)
		.minus(proratedPrepaidRefund)
		.toNumber();

	// Preview cancel immediately
	const cancelParams = {
		customer_id: customerId,
		product_id: pro.id,
		cancel: "immediately" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

	// Preview should match expected prorated refund
	expect(preview.total).toBeCloseTo(expectedRefund, 0);

	// Cancel immediately
	await autumnV1.subscriptions.update(cancelParams);

	// Verify product is removed
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	// Verify invoice matches preview
	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 2,
		latestTotal: preview.total,
	});

	// Verify no Stripe subscription exists
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Cancel immediately - base + allocated (mid-cycle with exact proration)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has Pro ($20/mo) with 8 allocated users ($10/seat = $80)
 * - Advance 15 days (mid-cycle)
 * - Cancel immediately
 *
 * Expected Result:
 * - Preview total should be prorated refund for remaining ~15 days
 * - Exact calculation: base refund + allocated refund (both prorated)
 * - Invoice should match preview.total
 */
test.concurrent(`${chalk.yellowBright("cancel immediately billing: base + allocated (mid-cycle exact proration)")}`, async () => {
	const customerId = "cancel-imm-billing-allocated-mid";

	const allocatedSeats = 8;
	const pricePerSeat = 10;
	const basePrice = 20;

	const allocatedItem = items.allocatedUsers({
		includedUsage: 0, // No free seats
	});

	const pro = products.pro({
		id: "pro",
		items: [allocatedItem],
	});

	const { autumnV1, ctx, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.attach({ productId: pro.id }),
			s.advanceTestClock({ days: 15 }), // Mid-cycle
		],
	});

	// Track users at mid-cycle
	await autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Users,
		value: allocatedSeats,
	});

	// Get billing period for proration calculation
	const customerMidCycle =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	const subscription = customerMidCycle.products?.[0];
	if (
		!subscription?.current_period_start ||
		!subscription?.current_period_end
	) {
		throw new Error("Missing billing period on subscription");
	}

	const billingPeriod = {
		start: subscription.current_period_start,
		end: subscription.current_period_end,
	};

	// Calculate expected prorated refund
	const frozenTimeMs = Math.floor(advancedTo! / 1000) * 1000;

	const allocatedAmount = allocatedSeats * pricePerSeat; // $80

	// Prorated refund for base price (full cycle remaining from start)
	const proratedBaseRefund = applyProration({
		now: frozenTimeMs,
		billingPeriod,
		amount: basePrice,
	});

	// Prorated refund for allocated seats (from mid-cycle when tracked)
	// Note: allocated seats were added mid-cycle, so they get refund for remaining time
	const proratedAllocatedRefund = applyProration({
		now: frozenTimeMs,
		billingPeriod,
		amount: allocatedAmount,
	});

	const expectedRefund = new Decimal(-proratedBaseRefund)
		.minus(proratedAllocatedRefund)
		.toNumber();

	// Preview cancel immediately
	const cancelParams = {
		customer_id: customerId,
		product_id: pro.id,
		cancel: "immediately" as const,
	};

	const preview = await autumnV1.subscriptions.previewUpdate(cancelParams);

	// Preview should match expected prorated refund
	expect(preview.total).toBeCloseTo(expectedRefund, 0);

	// Cancel immediately
	await autumnV1.subscriptions.update(cancelParams);

	// Verify product is removed
	const customerAfterCancel =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductNotPresent({
		customer: customerAfterCancel,
		productId: pro.id,
	});

	// Verify invoice matches preview
	expectCustomerInvoiceCorrect({
		customer: customerAfterCancel,
		count: 3, // Initial ($20) + allocated overage + refund
		latestTotal: preview.total,
	});

	// Verify no Stripe subscription exists
	await expectNoStripeSubscription({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
