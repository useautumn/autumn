/**
 * Discount Edge Case Tests (Attach V2)
 *
 * Tests edge cases around discount preservation during scheduled switches:
 * - Repeating coupon duration preserved across phase transitions
 * - Downgrade succeeds when coupon was deleted (rollover scenario)
 * - Promo code applied via checkout is preserved during downgrade to free
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	CouponDurationType,
	RewardType,
} from "@autumn/shared";
import {
	applyCustomerCoupon,
	applySubscriptionDiscount,
	createPercentCoupon,
	deleteCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import {
	expectCustomerProducts,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { completeStripeCheckoutFormV2 } from "@tests/utils/browserPool/completeStripeCheckoutFormV2";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { constructCoupon } from "@/utils/scriptUtils/createTestProducts";

/**
 * Helper to extract the discount ID from a Stripe discount object.
 */
const extractDiscountId = (discount: unknown): string | null => {
	if (typeof discount === "string") return discount;
	if (discount && typeof discount === "object" && "id" in discount) {
		return (discount as { id: string }).id;
	}
	return null;
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Repeating coupon duration preserved across phase transition
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premium ($50/mo) with 3-month repeating 20% off coupon
 * - Downgrade to pro ($20/mo) - scheduled
 * - Advance test clock past one billing cycle
 *
 * Expected Result:
 * - After cycle: pro is active with discount still present
 * - The discount's `end` timestamp should be the SAME as the original
 *   (not reset to phase2_start + 3 months)
 * - This means if 1 month was used on premium, only 2 months remain on pro
 *
 * This test catches the bug where using `coupon: couponId` on phases
 * creates a fresh discount with a reset duration, instead of using
 * `discount: discountId` to preserve the original duration.
 */
test.concurrent(`${chalk.yellowBright("discount-edge-cases 1: repeating coupon duration preserved across phase transition")}`, async () => {
	const customerId = "sched-switch-discount-duration";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({
		includedUsage: 1000,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1, ctx, testClockId, advancedTo } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: premium.id })],
	});

	// Create a 3-month repeating coupon and apply to subscription
	const { stripeCli, subscription: subBefore } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
		duration: "repeating",
		durationInMonths: 3,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subBefore.id,
		couponIds: [coupon.id],
	});

	// Record the original discount's end timestamp
	const subWithDiscount = await stripeCli.subscriptions.retrieve(subBefore.id, {
		expand: ["discounts.source.coupon"],
	});
	expect(subWithDiscount.discounts?.length).toBeGreaterThanOrEqual(1);

	const originalDiscount = subWithDiscount.discounts?.[0];
	expect(originalDiscount).toBeDefined();
	const originalDiscountEnd =
		typeof originalDiscount !== "string" ? originalDiscount?.end : null;
	expect(originalDiscountEnd).not.toBeNull();

	// Schedule downgrade to pro
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	// Advance to next billing cycle
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		currentEpochMs: advancedTo,
		withPause: true,
	});

	// Verify pro is now active
	const customerAfterCycle =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer: customerAfterCycle,
		active: [pro.id],
		notPresent: [premium.id],
	});

	// KEY ASSERTION: discount still present AND end timestamp is preserved
	const { subscription: subAfterCycle } = await getStripeSubscription({
		customerId,
	});
	const subAfterExpanded = await stripeCli.subscriptions.retrieve(
		subAfterCycle.id,
		{ expand: ["discounts.source.coupon"] },
	);

	expect(subAfterExpanded.discounts?.length).toBeGreaterThanOrEqual(1);

	const discountAfterCycle = subAfterExpanded.discounts?.[0];
	const discountEndAfterCycle =
		typeof discountAfterCycle !== "string" ? discountAfterCycle?.end : null;

	// The discount end should be the SAME as the original - not reset
	// If it was reset, it would be ~phase2_start + 3 months (much later)
	expect(discountEndAfterCycle).toBe(originalDiscountEnd);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Downgrade with deleted coupon (rollover scenario)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario (mirrors handleStripeInvoiceDiscounts rollover flow):
 * - Customer has premium ($50/mo)
 * - A coupon is applied to the CUSTOMER (not the subscription) via rawRequest
 * - The coupon is immediately deleted from Stripe
 * - The customer-level discount survives but its coupon is gone
 * - Customer attempts to downgrade to pro ($20/mo)
 *
 * Expected Result:
 * - The downgrade should succeed without Stripe errors
 * - Premium is canceling, pro is scheduled
 */
test.concurrent(`${chalk.yellowBright("discount-edge-cases 2: downgrade succeeds when coupon was deleted (rollover scenario)")}`, async () => {
	const customerId = "sched-switch-discount-deleted-coupon";

	const proMessagesItem = items.monthlyMessages({ includedUsage: 500 });
	const pro = products.pro({
		id: "pro",
		items: [proMessagesItem],
	});

	const premiumMessagesItem = items.monthlyMessages({
		includedUsage: 1000,
	});
	const premium = products.premium({
		id: "premium",
		items: [premiumMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: premium.id })],
	});

	// Get Stripe client and customer ID
	const { stripeCli, stripeCustomerId } = await getStripeSubscription({
		customerId,
	});

	// Create coupon and apply to the CUSTOMER (not the subscription).
	// This mirrors the rollover flow in handleStripeInvoiceDiscounts which uses
	// rawRequest POST /v1/customers/{id} with { coupon: newCoupon.id }
	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
	});

	await applyCustomerCoupon({
		stripeCustomerId,
		couponId: coupon.id,
	});

	// DELETE the coupon — mirrors handleStripeInvoiceDiscounts line 148:
	// stripeCli.coupons.del(newCoupon.id)
	// The customer-level discount survives but its coupon object is gone
	await deleteCoupon({ stripeCli, couponId: coupon.id });

	// Schedule downgrade to pro — this is where the bug manifests.
	// setupStripeDiscountsForBilling finds no subscription discounts, falls back
	// to customer discount. The customer discount has an expanded source.coupon
	// referencing the deleted coupon. Without the fix, Stripe throws
	// "No such coupon: '{couponId}'" when creating the schedule phases.
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	// Verify product states
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer,
		productId: pro.id,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Promo code via checkout preserved during downgrade to free
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario (reproduces the real customer bug):
 * - Customer subscribes to pro ($20/mo) via Stripe Checkout
 * - Promo code (20% off, 2 months) is entered on the checkout page
 * - Advance 14 days (mid-cycle)
 * - Downgrade to free (schedules cancel_at via direct subscription update)
 *
 * Expected Result:
 * - The discount ID should be PRESERVED (same di_xxx before and after)
 * - The discount's start/end timestamps should NOT change
 *
 * Bug: stripeDiscountsToParams was sending { coupon: "..." } instead of
 * { discount: "di_xxx" }, causing Stripe to create a brand new discount
 * (with fresh dates and no promotion_code reference) for promo-code-applied
 * discounts.
 */
test.concurrent(`${chalk.yellowBright("discount-edge-cases 3: promo code via checkout preserved during downgrade to free")}`, async () => {
	const customerId = "promo-checkout-to-free";

	const free = products.base({
		id: "free",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	// Create a reward with a promo code (20% off for 2 months)
	const promoCode = `PROMO${Date.now()}`;
	const reward = constructCoupon({
		id: "promo-checkout-reward",
		promoCode,
		discountType: RewardType.PercentageDiscount,
		discountValue: 20,
	});

	// Override duration to 2 months (matching the real customer's case)
	reward.discount_config!.duration_type = CouponDurationType.Months;
	reward.discount_config!.duration_value = 2;

	const { autumnV1, testClockId, ctx } = await initScenario({
		customerId,
		setup: [
			// No payment method → forces checkout flow
			s.customer({ testClock: true }),
			s.products({ list: [free, pro] }),
			s.reward({ reward, productId: pro.id }),
		],
		actions: [],
	});

	// Attach pro WITHOUT passing reward → checkout has allow_promotion_codes: true
	const res = await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
	});

	// Complete checkout with promo code entered on the Stripe checkout page
	await completeStripeCheckoutFormV2({
		url: res.checkout_url,
		promoCode,
	});
	await timeout(10000);

	// Record discount state before downgrade
	const subBefore = await getStripeSubscription({
		customerId,
		expand: ["data.discounts"],
	});

	const discountBefore = subBefore.subscription.discounts?.[0];
	expect(discountBefore).toBeDefined();
	const discountIdBefore = extractDiscountId(discountBefore);
	const discountEndBefore =
		typeof discountBefore !== "string" ? discountBefore?.end : null;
	expect(discountIdBefore).not.toBeNull();
	expect(discountEndBefore).not.toBeNull();

	// Advance 14 days (mid-cycle)
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 14,
	});

	// Downgrade to free (triggers direct subscription update with cancel_at)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: free.id,
		redirect_mode: "if_required",
	});

	// Verify discount is preserved (same ID, same end date)
	const subAfter = await getStripeSubscription({
		customerId,
		expand: ["data.discounts"],
	});

	const discountAfter = subAfter.subscription.discounts?.[0];
	expect(discountAfter).toBeDefined();
	const discountIdAfter = extractDiscountId(discountAfter);
	const discountEndAfter =
		typeof discountAfter !== "string" ? discountAfter?.end : null;

	// The discount ID should be the same (not a new discount)
	expect(discountIdAfter).toBe(discountIdBefore);

	// The discount end should be the same (not reset)
	expect(discountEndAfter).toBe(discountEndBefore);
});
