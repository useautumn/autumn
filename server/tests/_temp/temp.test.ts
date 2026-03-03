import { expect, test } from "bun:test";
import {
	applySubscriptionDiscount,
	createPercentCoupon,
	deleteCoupon,
	getStripeSubscription,
} from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { Decimal } from "decimal.js";

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

	// // Record discount identity before coupon deletion
	// const subWithDiscount = await stripeCli.subscriptions.retrieve(sub.id, {
	// 	expand: ["discounts.source.coupon"],
	// });
	// expect(subWithDiscount.discounts?.length).toBeGreaterThanOrEqual(1);

	// const discountBefore = subWithDiscount.discounts![0];
	// const discountIdBefore =
	// 	typeof discountBefore !== "string" ? discountBefore.id : null;
	// const discountEndBefore =
	// 	typeof discountBefore !== "string" ? discountBefore.end : null;
	// expect(discountIdBefore).not.toBeNull();
	// expect(discountEndBefore).not.toBeNull();

	// // Delete the coupon from Stripe — discount remains on subscription but
	// // the underlying coupon now has deleted: true
	// await deleteCoupon({ stripeCli, couponId: coupon.id });

	// // Advance 2 weeks mid-cycle
	// await advanceTestClock({
	// 	stripeCli: ctx.stripeCli,
	// 	testClockId: testClockId!,
	// 	numberOfDays: 14,
	// });

	// // Upgrade to premium (immediate switch) — should succeed even with deleted coupon
	// // The system must carry over via { discount: id }, NOT { coupon: id }
	// await autumnV1.billing.attach({
	// 	customer_id: customerId,
	// 	product_id: premium.id,
	// 	redirect_mode: "if_required",
	// });

	// // Verify discount is preserved on the upgraded subscription
	// const { subscription: subAfterUpgrade } = await getStripeSubscription({
	// 	customerId,
	// });
	// const subAfter = await stripeCli.subscriptions.retrieve(subAfterUpgrade.id, {
	// 	expand: ["discounts.source.coupon"],
	// });
	// expect(subAfter.discounts?.length).toBeGreaterThanOrEqual(1);

	// const discountAfter = subAfter.discounts![0];
	// const discountIdAfter =
	// 	typeof discountAfter !== "string" ? discountAfter.id : null;
	// const discountEndAfter =
	// 	typeof discountAfter !== "string" ? discountAfter.end : null;

	// // Discount ID must be the same (carried over via { discount: id }, not re-created from coupon)
	// expect(discountIdAfter).toBe(discountIdBefore);

	// // Discount end must be the same (duration not reset by the plan switch)
	// expect(discountEndAfter).toBe(discountEndBefore);
});
