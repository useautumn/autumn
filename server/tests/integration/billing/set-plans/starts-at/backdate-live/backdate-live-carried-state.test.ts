/**
 * What a backdate recreate carries off the live subscription:
 * - a repeating coupon keeps only its remaining cycles, so the next renewals stay discounted
 *   exactly as long as they would have been;
 * - a past_due subscription's open invoice stays open and is not charged a second time.
 */

import { expect, test } from "bun:test";
import { ms, type SetPlansParamsV0Input } from "@autumn/shared";
import { driveProductPastDue } from "@tests/integration/billing/utils/driveProductPastDue";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import {
	expectEachPeriodBilledOnce,
	expectRecreatedSubscriptionCorrect,
	expectReplacedSubscriptionCancelledQuietly,
	liveSubscriptionPeriod,
} from "./utils/backdateLiveUtils";

const COUPON_PERCENT_OFF = 20;
const COUPON_MONTHS = 3;
const REMAINING_COUPON_MONTHS = 2;

const discountCoupon = (discount: string | Stripe.Discount) => {
	if (typeof discount === "string") return undefined;
	const coupon = discount.source?.coupon;
	return typeof coupon === "string" ? undefined : coupon;
};

test.concurrent(
	`${chalk.yellowBright("set-plans backdate live: a repeating coupon carries only its remaining cycles")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId, autumnV2_4, ctx, testClockId, advancedTo } =
			await initScenario({
				customerId: "set-plans-backdate-live-coupon",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro] }),
				],
				actions: [s.billing.attach({ productId: pro.id })],
			});
		const { subscription } = await liveSubscriptionPeriod({ ctx, customerId });
		const coupon = await ctx.stripeCli.coupons.create({
			percent_off: COUPON_PERCENT_OFF,
			duration: "repeating",
			duration_in_months: COUPON_MONTHS,
		});
		await ctx.stripeCli.subscriptions.update(subscription.id, {
			discounts: [{ coupon: coupon.id }],
		});
		await advanceTestClock({
			stripeCli: ctx.stripeCli,
			testClockId: testClockId!,
			advanceTo: advancedTo + ms.days(10),
			waitForSeconds: 20,
		});

		const live = await liveSubscriptionPeriod({ ctx, customerId });
		const backdatedStart = live.startMs - ms.days(10);
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [{ starts_at: backdatedStart, plans: [{ plan_id: pro.id }] }],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.warnings.map(({ type }) => type)).not.toContain(
			"discount_not_carried",
		);
		await autumnV2_4.billing.setPlans(params);

		const recreated = await expectRecreatedSubscriptionCorrect({
			ctx,
			customerId,
			replacedSubscriptionId: live.subscription.id,
			startMs: backdatedStart,
			periodEndMs: live.periodEndMs,
			renewalTotal: 16,
		});
		const withDiscounts = await ctx.stripeCli.subscriptions.retrieve(
			recreated.id,
			{ expand: ["discounts.source.coupon"] },
		);
		const [carriedCoupon] = withDiscounts.discounts.map(discountCoupon);
		expect(carriedCoupon).toMatchObject({
			percent_off: COUPON_PERCENT_OFF,
			duration: "repeating",
			duration_in_months: REMAINING_COUPON_MONTHS,
		});
		expect(carriedCoupon?.id.startsWith(`${coupon.id}_roll_`)).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans backdate live: a past_due subscription's open invoice stays open and isn't charged again")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId, autumnV2_4, ctx, testClockId } = await initScenario({
			customerId: "set-plans-backdate-live-past-due",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});
		await driveProductPastDue({
			ctx,
			testClockId: testClockId!,
			customerId,
			productId: pro.id,
		});
		const live = await liveSubscriptionPeriod({
			ctx,
			customerId,
			status: "past_due",
		});
		const { data: openInvoices } = await ctx.stripeCli.invoices.list({
			subscription: live.subscription.id,
			status: "open",
		});
		expect(openInvoices).toHaveLength(1);
		const backdatedStart = live.startMs - ms.days(5);

		await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
			customer_id: customerId,
			phases: [{ starts_at: backdatedStart, plans: [{ plan_id: pro.id }] }],
		});

		await expectReplacedSubscriptionCancelledQuietly({
			ctx,
			subscriptionId: live.subscription.id,
			invoiceCountBefore: live.invoiceCount,
		});
		const stillOpen = await ctx.stripeCli.invoices.retrieve(
			openInvoices[0]!.id!,
		);
		expect(stillOpen.status).toBe("open");
		await expectRecreatedSubscriptionCorrect({
			ctx,
			customerId,
			replacedSubscriptionId: live.subscription.id,
			startMs: backdatedStart,
			periodEndMs: live.periodEndMs,
			renewalTotal: 20,
		});
		await expectEachPeriodBilledOnce({
			ctx,
			customerId,
			periods: [
				{ startMs: live.periodStartMs, endMs: live.periodEndMs, total: 20 },
			],
		});
	},
);
