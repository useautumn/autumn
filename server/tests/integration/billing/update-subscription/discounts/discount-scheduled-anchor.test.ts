/**
 * A discount added by update_subscription while a pending billing cycle anchor keeps the subscription on a schedule
 * reaches every schedule phase the coupon's duration covers.
 * Plain Stripe keeps a coupon added to a scheduled subscription on the current phase only; Autumn owns the schedule,
 * so it carries the coupon as it would last on the same subscription without one.
 */

import { expect, test } from "bun:test";
import {
	msToSeconds,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { advanceToAnchor } from "@tests/integration/billing/utils/advanceUtils/advanceToAnchor";
import { createPercentCoupon } from "@tests/integration/billing/utils/discounts/discountTestUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addDays } from "date-fns";
import type Stripe from "stripe";
import { findStripeSubscriptionByStatus } from "../../set-plans/utils/subscriptionStateUtils";

/** The reset phase must reuse the subscription's own discount, so the coupon's duration runs on unchanged. */
const expectResetPhaseKeepsDiscount = ({
	resetPhase,
	subscriptionDiscountIds,
}: {
	resetPhase?: Stripe.SubscriptionSchedule.Phase;
	subscriptionDiscountIds: string[];
}) => {
	expect(subscriptionDiscountIds).toHaveLength(1);
	expect(
		resetPhase?.discounts.map((discount) =>
			typeof discount.discount === "string"
				? discount.discount
				: discount.discount?.id,
		),
	).toEqual(subscriptionDiscountIds);
};

/** Attaches Pro ($20), schedules an anchor at +10 d, then adds a 50% coupon through update_subscription. */
const addDiscountBeforeScheduledAnchor = async ({
	customerId,
	prorationBehavior,
	coupon: couponParams = { duration: "forever" },
}: {
	customerId: string;
	prorationBehavior?: "none";
	coupon?: { duration: "forever" | "repeating"; durationInMonths?: number };
}) => {
	const pro = products.pro({
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { autumnV2_3, ctx, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	const anchorMs = addDays(advancedTo, 10).getTime();
	await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: pro.id,
		billing_cycle_anchor: anchorMs,
		...(prorationBehavior && { proration_behavior: prorationBehavior }),
	});

	const coupon = await createPercentCoupon({
		stripeCli: ctx.stripeCli,
		percentOff: 50,
		...couponParams,
	});
	const discountParams = {
		customer_id: customerId,
		plan_id: pro.id,
		discounts: [{ reward_id: coupon.id }],
	} satisfies UpdateSubscriptionV1ParamsInput;
	const preview = await autumnV2_3.subscriptions.previewUpdate(discountParams);
	await autumnV2_3.subscriptions.update(discountParams);

	const subscription = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: "active",
	});
	const scheduleId =
		typeof subscription.schedule === "string"
			? subscription.schedule
			: subscription.schedule?.id;
	const schedule = await ctx.stripeCli.subscriptionSchedules.retrieve(
		scheduleId!,
		{ expand: ["phases.discounts.discount"] },
	);
	const resetPhase = schedule.phases.find(
		(phase) => phase.start_date === msToSeconds(anchorMs),
	);
	const upcomingInvoice = await ctx.stripeCli.invoices.createPreview({
		subscription: subscription.id,
	});

	return {
		ctx,
		testClockId: testClockId!,
		advancedTo,
		anchorMs,
		subscriptionId: subscription.id,
		preview,
		resetPhase,
		subscriptionDiscountIds: subscription.discounts.map((discount) =>
			typeof discount === "string" ? discount : discount.id,
		),
		upcomingInvoice,
	};
};

test.concurrent(
	`${chalk.yellowBright("update-sub discount on a scheduled anchor: a forever coupon discounts the always_invoice anchor invoice")}`,
	async () => {
		const { resetPhase, subscriptionDiscountIds, upcomingInvoice } =
			await addDiscountBeforeScheduledAnchor({
				customerId: "update-sub-discount-anchor-always-invoice",
			});

		expectResetPhaseKeepsDiscount({ resetPhase, subscriptionDiscountIds });
		expect(resetPhase?.proration_behavior).toBe("always_invoice");
		// Stripe discounts the netted anchor invoice: $6.45 (20 × 10/31) less a $3.23 discount it rounds up.
		expect(upcomingInvoice.total).toBe(322);
	},
);

test.concurrent(
	`${chalk.yellowBright("update-sub discount on a scheduled anchor: a forever coupon carries past a proration none anchor")}`,
	async () => {
		const { resetPhase, subscriptionDiscountIds, upcomingInvoice } =
			await addDiscountBeforeScheduledAnchor({
				customerId: "update-sub-discount-anchor-none",
				prorationBehavior: "none",
			});

		expectResetPhaseKeepsDiscount({ resetPhase, subscriptionDiscountIds });
		expect(resetPhase?.proration_behavior).toBe("none");
		expect(upcomingInvoice.total).toBe(1000);
	},
);

test.concurrent(
	`${chalk.yellowBright("update-sub discount on a scheduled anchor: next_cycle previews Stripe's upcoming invoice under always_invoice")}`,
	async () => {
		const { preview, upcomingInvoice } = await addDiscountBeforeScheduledAnchor(
			{
				customerId: "update-sub-discount-anchor-preview-always-invoice",
			},
		);

		expect(preview.next_cycle?.total).toBe(upcomingInvoice.total / 100);
		expect(msToSeconds(preview.next_cycle?.starts_at ?? 0)).toBe(
			upcomingInvoice.period_end,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("update-sub discount on a scheduled anchor: next_cycle previews Stripe's upcoming invoice under none")}`,
	async () => {
		const { preview, upcomingInvoice } = await addDiscountBeforeScheduledAnchor(
			{
				customerId: "update-sub-discount-anchor-preview-none",
				prorationBehavior: "none",
			},
		);

		expect(preview.next_cycle?.total).toBe(upcomingInvoice.total / 100);
		expect(msToSeconds(preview.next_cycle?.starts_at ?? 0)).toBe(
			upcomingInvoice.period_end,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("update-sub discount on a scheduled anchor: a repeating coupon keeps its end across the reset and stops at it")}`,
	async () => {
		const {
			ctx,
			testClockId,
			advancedTo,
			anchorMs,
			subscriptionId,
			resetPhase,
			subscriptionDiscountIds,
		} = await addDiscountBeforeScheduledAnchor({
			customerId: "update-sub-discount-anchor-repeating",
			coupon: { duration: "repeating", durationInMonths: 1 },
		});
		expectResetPhaseKeepsDiscount({ resetPhase, subscriptionDiscountIds });
		const discountBefore = await ctx.stripeCli.subscriptions
			.retrieve(subscriptionId, { expand: ["discounts"] })
			.then(({ discounts }) => discounts[0] as Stripe.Discount);

		await advanceToAnchor({
			stripeCli: ctx.stripeCli,
			testClockId,
			advancedTo,
			anchorMs,
		});

		const subscription = await ctx.stripeCli.subscriptions.retrieve(
			subscriptionId,
			{ expand: ["discounts"] },
		);
		const discountAfter = subscription.discounts[0] as Stripe.Discount;
		expect(subscription.billing_cycle_anchor).toBe(msToSeconds(anchorMs));
		expect({ id: discountAfter.id, end: discountAfter.end }).toEqual({
			id: discountBefore.id,
			end: discountBefore.end,
		});

		// The month ends before the first renewal after the anchor, so that renewal is billed in full.
		const upcomingInvoice = await ctx.stripeCli.invoices.createPreview({
			subscription: subscriptionId,
		});
		expect(discountBefore.end).toBeLessThan(upcomingInvoice.period_end);
		expect(upcomingInvoice.total).toBe(2000);
	},
);
