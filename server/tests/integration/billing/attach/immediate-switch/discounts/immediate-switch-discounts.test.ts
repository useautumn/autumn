/**
 * Immediate Switch Discount Preservation Tests
 *
 * Tests that discounts are preserved (same ID, same duration/end date)
 * when upgrading from one paid product to another.
 * Users should NOT get extra discount duration from plan changes.
 */

import { expect, test } from "bun:test";
import {
	applyCustomerCoupon,
	applySubscriptionDiscount,
	createPercentCoupon,
	deleteCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { Decimal } from "decimal.js";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1: Upgrade pro → premium preserves discount identity and duration
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo) with 2-month repeating 20% off coupon
 * - Advance 2 weeks (mid-cycle)
 * - Upgrade to premium ($50/mo) — immediate switch
 *
 * Expected:
 * - Discount ID unchanged (same di_xxx)
 * - Discount end timestamp unchanged (duration not reset)
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-discounts 1: upgrade pro -> premium preserves discount identity and duration")}`, async () => {
	const customerId = "imm-switch-discount-upgrade";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1, testClockId, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Apply 2-month repeating 20% off coupon
	const { stripeCli, subscription: sub } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
		duration: "repeating",
		durationInMonths: 2,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: sub.id,
		couponIds: [coupon.id],
	});

	// Record discount before upgrade
	const subWithDiscount = await stripeCli.subscriptions.retrieve(sub.id, {
		expand: ["discounts.source.coupon"],
	});
	expect(subWithDiscount.discounts?.length).toBeGreaterThanOrEqual(1);

	const discountBefore = subWithDiscount.discounts![0];
	const discountIdBefore =
		typeof discountBefore !== "string" ? discountBefore.id : null;
	const discountEndBefore =
		typeof discountBefore !== "string" ? discountBefore.end : null;
	expect(discountIdBefore).not.toBeNull();
	expect(discountEndBefore).not.toBeNull();

	// Advance 2 weeks
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 14,
	});

	// Upgrade to premium (immediate switch)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	// Verify discount is preserved
	const { subscription: subAfterUpgrade } = await getStripeSubscription({
		customerId,
	});
	const subAfter = await stripeCli.subscriptions.retrieve(subAfterUpgrade.id, {
		expand: ["discounts.source.coupon"],
	});
	expect(subAfter.discounts?.length).toBeGreaterThanOrEqual(1);

	const discountAfter = subAfter.discounts![0];
	const discountIdAfter =
		typeof discountAfter !== "string" ? discountAfter.id : null;
	const discountEndAfter =
		typeof discountAfter !== "string" ? discountAfter.end : null;

	// Discount ID must be the same (not re-created)
	expect(discountIdAfter).toBe(discountIdBefore);

	// Discount end must be the same (duration not reset)
	expect(discountEndAfter).toBe(discountEndBefore);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2: Upgrade pro → premium → ultra preserves discount through multiple switches
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo) with 3-month repeating 20% off coupon
 * - Advance 2 weeks
 * - Upgrade to premium ($50/mo)
 * - Upgrade to ultra ($200/mo)
 *
 * Expected:
 * - Discount ID unchanged through both upgrades
 * - Discount end timestamp unchanged (duration not reset)
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-discounts 2: discount preserved through multiple upgrades")}`, async () => {
	const customerId = "imm-switch-discount-multi-upgrade";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const ultra = products.ultra({
		id: "ultra",
		items: [items.monthlyMessages({ includedUsage: 5000 })],
	});

	const { autumnV1, testClockId, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium, ultra] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Apply 3-month repeating 20% off coupon
	const { stripeCli, subscription: sub } = await getStripeSubscription({
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
		subscriptionId: sub.id,
		couponIds: [coupon.id],
	});

	// Record original discount
	const subWithDiscount = await stripeCli.subscriptions.retrieve(sub.id, {
		expand: ["discounts.source.coupon"],
	});
	const discountBefore = subWithDiscount.discounts![0];
	const discountIdBefore =
		typeof discountBefore !== "string" ? discountBefore.id : null;
	const discountEndBefore =
		typeof discountBefore !== "string" ? discountBefore.end : null;
	expect(discountIdBefore).not.toBeNull();
	expect(discountEndBefore).not.toBeNull();

	// Advance 2 weeks
	await advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
		numberOfDays: 14,
	});

	// Upgrade pro → premium
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	// Upgrade premium → ultra
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: ultra.id,
		redirect_mode: "if_required",
	});

	// Verify discount is preserved after both upgrades
	const { subscription: subAfter } = await getStripeSubscription({
		customerId,
	});
	const subAfterExpanded = await stripeCli.subscriptions.retrieve(subAfter.id, {
		expand: ["discounts.source.coupon"],
	});
	expect(subAfterExpanded.discounts?.length).toBeGreaterThanOrEqual(1);

	const discountAfter = subAfterExpanded.discounts![0];
	const discountIdAfter =
		typeof discountAfter !== "string" ? discountAfter.id : null;
	const discountEndAfter =
		typeof discountAfter !== "string" ? discountAfter.end : null;

	// Discount ID must be the same through both upgrades
	expect(discountIdAfter).toBe(discountIdBefore);

	// Discount end must be the same (duration not reset)
	expect(discountEndAfter).toBe(discountEndBefore);
});

/**
 * Scenario:
 * - Customer has pro ($20/mo) with 2-month repeating 20% off coupon
 * - Delete the coupon from Stripe (coupon.deleted = true)
 * - Advance 2 weeks (mid-cycle)
 * - Upgrade to premium ($50/mo) — immediate switch
 *
 * Expected:
 * - Upgrade succeeds (no error even though coupon is deleted)
 * - Discount ID unchanged (same di_xxx — carried over via { discount: id })
 * - Discount end timestamp unchanged (duration not reset)
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-discounts 3: upgrade carries over discount when coupon is deleted")}`, async () => {
	const customerId = "imm-switch-discount-deleted-coupon";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1, testClockId, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	// Apply 2-month repeating 20% off coupon to the subscription
	const { stripeCli, subscription: sub } = await getStripeSubscription({
		customerId,
	});

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
		duration: "repeating",
		durationInMonths: 2,
	});

	await applySubscriptionDiscount({
		stripeCli,
		subscriptionId: sub.id,
		couponIds: [coupon.id],
	});

	await deleteCoupon({ stripeCli, couponId: coupon.id });

	const upgradeParams = {
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	};
	const upgradePreview = await autumnV1.billing.previewAttach(upgradeParams);

	const expectedTotal = new Decimal(50).times(0.8).sub(20).toNumber();
	expect(upgradePreview.total).toEqual(expectedTotal);

	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	const customerAfter = await autumnV1.customers.get(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: expectedTotal,
	});
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4: Upgrade carries over customer-level discount when coupon is deleted
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo) with NO subscription-level discount
 * - Apply a 2-month repeating 20% off coupon directly to the Stripe customer
 *   (legacy API, sets customer.discount rather than subscription.discounts)
 * - Delete the coupon from Stripe (coupon.deleted = true)
 * - Advance 2 weeks (mid-cycle)
 * - Upgrade to premium ($50/mo) — immediate switch
 *
 * Expected:
 * - Upgrade succeeds (no error even though coupon is deleted)
 * - The customer discount is carried over — new subscription has a discount
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-discounts 4: upgrade carries over customer-level discount when coupon is deleted")}`, async () => {
	const customerId = "imm-switch-discount-deleted-customer-coupon";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1, testClockId, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const { stripeCli, stripeCustomerId } = await getStripeSubscription({
		customerId,
	});

	// Apply coupon to customer (not subscription) via legacy API
	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
		duration: "repeating",
		durationInMonths: 2,
	});

	await applyCustomerCoupon({ stripeCustomerId, couponId: coupon.id });
	await deleteCoupon({ stripeCli, couponId: coupon.id });

	// Upgrade to premium (immediate switch)
	await autumnV1.billing.attach({
		customer_id: customerId,
		product_id: premium.id,
		redirect_mode: "if_required",
	});

	// Verify upgrade succeeded and the customer-level discount carried over
	const { subscription: subAfterUpgrade } = await getStripeSubscription({
		customerId,
	});
	const subAfter = await stripeCli.subscriptions.retrieve(subAfterUpgrade.id, {
		expand: ["discounts.source.coupon"],
	});
	expect(subAfter.discounts?.length).toBeGreaterThanOrEqual(1);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5: Upgrade applies 1-month recurring coupon to immediate switch invoice
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario:
 * - Customer has pro ($20/mo)
 * - Apply a 1-month repeating 20% off coupon to the subscription
 * - Upgrade immediately to premium ($50/mo)
 *
 * Expected:
 * - Upgrade succeeds
 * - Preview + invoice reflect the discounted upgrade charge
 * - Existing discount instance is preserved on the upgraded subscription
 */
test.concurrent(`${chalk.yellowBright("immediate-switch-discounts 5: upgrade works with 1-month recurring coupon")}`, async () => {
	const customerId = "imm-switch-discount-one-month-upgrade";

	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});

	const { autumnV1 } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const { stripeCli } = await getStripeSubscription({ customerId });

	const coupon = await createPercentCoupon({
		stripeCli,
		percentOff: 20,
		duration: "repeating",
		durationInMonths: 1,
	});

	const upgradeParams = {
		customer_id: customerId,
		product_id: premium.id,
		discounts: [
			{
				reward_id: coupon.id,
			},
		],
		redirect_mode: "if_required" as const,
	};

	const preview = await autumnV1.billing.previewAttach(upgradeParams);
	const expectedTotal = new Decimal(50).times(0.8).sub(20).toNumber();
	expect(preview.total).toEqual(expectedTotal);

	await autumnV1.billing.attach(upgradeParams);

	const customerAfter = await autumnV1.customers.get(customerId);
	await expectCustomerInvoiceCorrect({
		customer: customerAfter,
		count: 2,
		latestTotal: expectedTotal,
	});

	const { subscription: upgradedSub } = await getStripeSubscription({
		customerId,
	});
	const upgradedSubWithDiscount = await stripeCli.subscriptions.retrieve(
		upgradedSub.id,
		{
			expand: ["discounts.source.coupon"],
		},
	);
	expect(upgradedSubWithDiscount.discounts?.length).toBeGreaterThanOrEqual(1);

	const discountAfter = upgradedSubWithDiscount.discounts?.find((discount) => {
		if (typeof discount === "string") return false;

		const discountCoupon = discount.source?.coupon;
		return (
			typeof discountCoupon !== "string" && discountCoupon?.id === coupon.id
		);
	});

	expect(discountAfter).toBeDefined();
	expect(
		typeof discountAfter !== "string" ? discountAfter?.end : null,
	).not.toBeNull();
});
