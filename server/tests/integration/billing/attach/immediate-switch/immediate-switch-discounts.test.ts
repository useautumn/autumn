/**
 * Immediate Switch Discount Preservation Tests
 *
 * Tests that discounts are preserved (same ID, same duration/end date)
 * when upgrading from one paid product to another.
 * Users should NOT get extra discount duration from plan changes.
 */

import { expect, test } from "bun:test";
import {
	applySubscriptionDiscount,
	createPercentCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

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
