/**
 * Invoice Created Webhook Tests - Discounts
 *
 * Tests for verifying that discounts are correctly stored in the Autumn DB
 * when the `invoice.created` Stripe webhook is processed.
 *
 * These tests verify that:
 * 1. Subscription-level discounts are correctly persisted to the invoice.discounts field
 * 2. Discount amounts and coupon names are correctly extracted
 */

import { expect, test } from "bun:test";
import { InvoiceStatus } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { CusService } from "@/internal/customers/CusService.js";
import { InvoiceService } from "@/internal/invoices/InvoiceService.js";

const getStripeInfo = async ({ customerId }: { customerId: string }) => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});

	const stripeCustomerId =
		fullCustomer.processor?.id || fullCustomer.processor?.processor_id;

	if (!stripeCustomerId) {
		throw new Error("Missing Stripe customer ID");
	}

	const subscriptions = await stripeCli.subscriptions.list({
		customer: stripeCustomerId,
		status: "all",
	});

	return {
		stripeCli,
		stripeCustomerId,
		subscription: subscriptions.data[0],
		fullCustomer,
	};
};

// =============================================================================
// TEST: Subscription discount persisted to Autumn invoice on invoice.created
// =============================================================================

/**
 * Scenario:
 * - Customer has Pro with $20/month base price
 * - Apply a 20% discount to the subscription
 * - Advance to next billing cycle (triggers invoice.created)
 *
 * Expected Result:
 * - The Autumn invoice should have the discount in the discounts array
 * - discount.coupon_name should match the coupon name
 * - discount.amount_used should be ~$4 (20% of $20)
 */
test.concurrent(`${chalk.yellowBright("invoice.created discounts: subscription 20% discount persisted to Autumn invoice")}`, async () => {
	const customerId = "inv-created-disc-sub-20pct";

	const pro = products.pro({
		id: "pro",
		items: [items.dashboard()],
	});

	const { autumnV1, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.attach({ productId: pro.id })],
	});

	const { stripeCli, subscription, fullCustomer } = await getStripeInfo({
		customerId,
	});

	// Create a 20% off coupon with a name
	const couponName = "Test 20% Off Coupon";
	const coupon = await stripeCli.coupons.create({
		percent_off: 20,
		duration: "forever",
		name: couponName,
	});

	// Apply coupon to the subscription
	await stripeCli.subscriptions.update(subscription.id, {
		discounts: [{ coupon: coupon.id }],
	});

	// Advance to next billing cycle - this triggers invoice.created webhook
	await advanceTestClock({
		stripeCli,
		testClockId: testClockId!,
		numberOfMonths: 1,
	});

	// Wait for webhook processing
	await new Promise((resolve) => setTimeout(resolve, 5000));

	// Query the Autumn invoice from DB
	const invoices = await InvoiceService.list({
		db: ctx.db,
		internalCustomerId: fullCustomer.internal_id,
	});

	// Should have 2 invoices: initial + renewal
	expect(invoices.length).toBeGreaterThanOrEqual(2);

	// Get the latest invoice (renewal invoice with discount)
	const latestInvoice = invoices[0];

	// Verify the discount is present
	expect(latestInvoice.status).toBe(InvoiceStatus.Draft);
	expect(latestInvoice.discounts).toBeDefined();
	expect(latestInvoice.discounts.length).toBe(1);

	const discount = latestInvoice.discounts[0];
	expect(discount.coupon_name).toBe(couponName);
	expect(discount.stripe_coupon_id).toBe(coupon.id);

	// 20% of $20 = $4
	expect(discount.amount_used).toBe(4);
});
