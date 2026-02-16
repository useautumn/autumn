/**
 * Scheduled Switch Discount Tests (Attach V2)
 *
 * Tests that discounts (coupons) applied to a Stripe subscription are preserved
 * when a plan is downgraded via scheduled switch.
 *
 * The bug: When creating subscription schedule phases in buildStripePhasesUpdate,
 * the `discounts` parameter is NOT set on the phases. This means when the subscription
 * transitions to the next phase at billing cycle end, discounts are lost.
 *
 * Key behaviors tested:
 * - Percent-off discount persists after scheduling a downgrade
 * - Amount-off discount persists after scheduling a downgrade
 * - Discount persists after advancing cycle (phase transition)
 * - Discount survives when replacing a scheduled downgrade with another
 * - Multiple discounts survive scheduling
 * - Discount survives upgrade that cancels a scheduled downgrade
 */

import { expect, test } from "bun:test";
import type { ApiCustomerV3 } from "@autumn/shared";
import {
	applySubscriptionDiscount,
	createAmountCoupon,
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import {
	expectCustomerProducts,
	expectProductCanceling,
	expectProductScheduled,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/**
 * Helper to extract coupon ID from a Stripe discount object.
 * Handles both string and expanded object forms.
 */
const extractCouponId = (discount: unknown): string | null => {
	if (typeof discount === "string") return discount;
	if (
		discount &&
		typeof discount === "object" &&
		"source" in discount &&
		discount.source &&
		typeof discount.source === "object" &&
		"coupon" in discount.source &&
		discount.source.coupon &&
		typeof discount.source.coupon === "object" &&
		"id" in discount.source.coupon
	) {
		return discount.source.coupon.id as string;
	}
	return null;
};

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Premium to Pro with 20% discount - verify discount on sub after schedule
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premium ($50/mo) with 20% off coupon on subscription
 * - Downgrade to pro ($20/mo) - scheduled for end of cycle
 *
 * Expected Result:
 * - Discount still present on Stripe subscription after scheduling the downgrade
 * - Premium is canceling, pro is scheduled
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-discounts 1: 20% discount preserved after scheduling downgrade")}`, async () => {
	const customerId = "sched-switch-discount-20pct";

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

	// Apply 20% discount to the subscription
	const { stripeCli, subscription: subBefore } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subBefore.id,
		couponIds: [coupon.id],
	});

	// Verify discount is applied before downgrade
	const subWithDiscount = await stripeCli.subscriptions.retrieve(subBefore.id, {
		expand: ["discounts.source.coupon"],
	});
	expect(subWithDiscount.discounts?.length).toBeGreaterThanOrEqual(1);

	// Schedule downgrade to pro
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

	// Verify discount is still on the subscription after scheduling the downgrade
	const { subscription: subAfter } = await getStripeSubscription({
		customerId,
	});
	const subAfterExpanded = await stripeCli.subscriptions.retrieve(subAfter.id, {
		expand: ["discounts.source.coupon"],
	});

	// KEY ASSERTION: discount should still be present
	expect(subAfterExpanded.discounts?.length).toBeGreaterThanOrEqual(1);
	expect(extractCouponId(subAfterExpanded.discounts?.[0])).toBe(coupon.id);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Premium to Pro with $10 off discount - verify discount after schedule
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premium ($50/mo) with $10 off coupon on subscription
 * - Downgrade to pro ($20/mo) - scheduled for end of cycle
 *
 * Expected Result:
 * - Amount-off discount still present on subscription after scheduling
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-discounts 2: $10 off discount preserved after scheduling downgrade")}`, async () => {
	const customerId = "sched-switch-discount-10off";

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

	// Apply $10 off discount to the subscription
	const { stripeCli, subscription: subBefore } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createAmountCoupon({
		stripeCli,
		amountOffCents: 1000,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subBefore.id,
		couponIds: [coupon.id],
	});

	// Schedule downgrade to pro
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

	// Verify discount is still on the subscription
	const { subscription: subAfter } = await getStripeSubscription({
		customerId,
	});
	const subAfterExpanded = await stripeCli.subscriptions.retrieve(subAfter.id, {
		expand: ["discounts.source.coupon"],
	});

	expect(subAfterExpanded.discounts?.length).toBeGreaterThanOrEqual(1);
	expect(extractCouponId(subAfterExpanded.discounts?.[0])).toBe(coupon.id);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3: Premium to Pro with discount - advance cycle, verify discount survives
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premium ($50/mo) with 20% off coupon
 * - Downgrade to pro ($20/mo) - scheduled
 * - Advance test clock to next billing cycle
 *
 * Expected Result:
 * - After cycle: pro is active, premium removed
 * - Discount should STILL be on the subscription after the phase transition
 *
 * THIS TEST EXPOSES THE BUG: subscription schedule phases don't carry discounts,
 * so when the subscription transitions to the pro phase, the discount is lost.
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-discounts 3: 20% discount preserved after cycle advance")}`, async () => {
	const customerId = "sched-switch-discount-cycle";

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

	// Apply 20% discount to the subscription
	const { stripeCli, subscription: subBefore } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subBefore.id,
		couponIds: [coupon.id],
	});

	// Verify discount applied before downgrade
	const subWithDiscount = await stripeCli.subscriptions.retrieve(subBefore.id, {
		expand: ["discounts.source.coupon"],
	});
	expect(subWithDiscount.discounts?.length).toBeGreaterThanOrEqual(1);

	// Schedule downgrade to pro
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	// Verify discount still present after scheduling
	const { subscription: subMid } = await getStripeSubscription({
		customerId,
	});
	const subMidExpanded = await stripeCli.subscriptions.retrieve(subMid.id, {
		expand: ["discounts.source.coupon"],
	});
	expect(subMidExpanded.discounts?.length).toBeGreaterThanOrEqual(1);

	// Advance to next billing cycle (discount is still on the subscription)
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		currentEpochMs: advancedTo,
		withPause: true,
	});

	const customerAfterCycle =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);

	// Verify pro is active, premium removed
	await expectCustomerProducts({
		customer: customerAfterCycle,
		active: [pro.id],
		notPresent: [premium.id],
	});

	// Verify features updated to pro tier
	expectCustomerFeatureCorrect({
		customer: customerAfterCycle,
		featureId: TestFeature.Messages,
		includedUsage: 500,
		balance: 500,
		usage: 0,
	});

	// KEY BUG CHECK: verify discount survives the phase transition
	const { subscription: subAfterCycle } = await getStripeSubscription({
		customerId,
	});
	const subAfterExpanded = await stripeCli.subscriptions.retrieve(
		subAfterCycle.id,
		{ expand: ["discounts.source.coupon"] },
	);

	// The discount should still be present after the scheduled switch completed
	expect(subAfterExpanded.discounts?.length).toBeGreaterThanOrEqual(1);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Premium to Pro (scheduled) to Free (replace) - discount preserved
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premium ($50/mo) with 20% off coupon
 * - Downgrade to pro ($20/mo) - scheduled
 * - Replace scheduled with free - re-schedules
 *
 * Expected Result:
 * - Discount still on subscription after replacing the scheduled downgrade
 *
 * The schedule is released and recreated during replacement. This test verifies
 * that the discount survives the release + recreate cycle.
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-discounts 4: discount preserved when replacing scheduled downgrade")}`, async () => {
	const customerId = "sched-switch-discount-replace";

	const messagesItem = items.monthlyMessages({ includedUsage: 100 });
	const free = products.base({
		id: "free",
		items: [messagesItem],
	});

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
			s.products({ list: [free, pro, premium] }),
		],
		actions: [s.billing.attach({ productId: premium.id })],
	});

	// Apply 20% discount to the subscription
	const { stripeCli, subscription: subBefore } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subBefore.id,
		couponIds: [coupon.id],
	});

	// Schedule downgrade to pro
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: pro.id,
		redirect_mode: "if_required",
	});

	// Verify mid-state
	const customerMid = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerMid,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: customerMid,
		productId: pro.id,
	});

	// Replace scheduled pro with free
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: free.id,
		redirect_mode: "if_required",
	});

	// Verify product states after replacement
	const customerAfterReplace =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerAfterReplace,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: customerAfterReplace,
		productId: free.id,
	});

	// Verify discount is still on the subscription after schedule replacement
	const { subscription: subAfterReplace } = await getStripeSubscription({
		customerId,
	});
	const subAfterExpanded = await stripeCli.subscriptions.retrieve(
		subAfterReplace.id,
		{ expand: ["discounts.source.coupon"] },
	);

	expect(subAfterExpanded.discounts?.length).toBeGreaterThanOrEqual(1);
	expect(extractCouponId(subAfterExpanded.discounts?.[0])).toBe(coupon.id);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Multiple discounts preserved after scheduled downgrade
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premium ($50/mo) with two discounts (20% off + $5 off)
 * - Downgrade to pro ($20/mo) - scheduled
 *
 * Expected Result:
 * - Both discounts still present on subscription after scheduling
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-discounts 5: multiple discounts preserved after scheduling")}`, async () => {
	const customerId = "sched-switch-discount-multi";

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

	// Apply two discounts to the subscription
	const { stripeCli, subscription: subBefore } = await getStripeSubscription({
		customerId,
	});

	const percentCoupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
	});

	const amountCoupon = await createAmountCoupon({
		stripeCli,
		amountOffCents: 500,
	});

	// Apply both discounts
	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subBefore.id,
		couponIds: [percentCoupon.id, amountCoupon.id],
	});

	// Verify both discounts applied
	const subWithDiscounts = await stripeCli.subscriptions.retrieve(
		subBefore.id,
		{ expand: ["discounts.source.coupon"] },
	);
	expect(subWithDiscounts.discounts?.length).toBe(2);

	// Schedule downgrade to pro
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

	// Verify BOTH discounts are still on the subscription
	const { subscription: subAfter } = await getStripeSubscription({
		customerId,
	});
	const subAfterExpanded = await stripeCli.subscriptions.retrieve(subAfter.id, {
		expand: ["discounts.source.coupon"],
	});

	expect(subAfterExpanded.discounts?.length).toBe(2);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6: Upgrade from scheduled downgrade - discount preserved
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has premium ($50/mo) with 20% off coupon
 * - Downgrade to pro ($20/mo) - scheduled
 * - Upgrade to ultra ($200/mo) - immediate, cancels schedule
 *
 * Expected Result:
 * - Discount should still be on the subscription after upgrade cancels the schedule
 * - Ultra is active, premium and pro are removed
 */
test.concurrent(`${chalk.yellowBright("scheduled-switch-discounts 6: discount preserved after upgrade cancels scheduled downgrade")}`, async () => {
	const customerId = "sched-switch-discount-upgrade";

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

	const ultraMessagesItem = items.monthlyMessages({
		includedUsage: 5000,
	});
	const ultra = products.ultra({
		id: "ultra",
		items: [ultraMessagesItem],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium, ultra] }),
		],
		actions: [
			s.billing.attach({ productId: premium.id }),
			s.billing.attach({ productId: pro.id }),
		],
	});

	// Apply 20% discount to the subscription
	const { stripeCli, subscription: subBefore } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: subBefore.id,
		couponIds: [coupon.id],
	});

	// Verify scheduled state
	const customerBefore =
		await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectProductCanceling({
		customer: customerBefore,
		productId: premium.id,
	});
	await expectProductScheduled({
		customer: customerBefore,
		productId: pro.id,
	});

	// Upgrade to ultra (should cancel scheduled downgrade)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: ultra.id,
		redirect_mode: "if_required",
	});

	// Verify ultra is active, premium and pro removed
	const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
	await expectCustomerProducts({
		customer,
		active: [ultra.id],
		notPresent: [premium.id, pro.id],
	});

	// Verify discount is still on the subscription after upgrade
	const { subscription: subAfter } = await getStripeSubscription({
		customerId,
	});
	const subAfterExpanded = await stripeCli.subscriptions.retrieve(subAfter.id, {
		expand: ["discounts.source.coupon"],
	});

	expect(subAfterExpanded.discounts?.length).toBeGreaterThanOrEqual(1);
	expect(extractCouponId(subAfterExpanded.discounts?.[0])).toBe(coupon.id);
});
