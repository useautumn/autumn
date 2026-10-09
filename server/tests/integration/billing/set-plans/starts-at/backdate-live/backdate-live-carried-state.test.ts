/**
 * What a backdate recreate carries off the live subscription:
 * - a repeating coupon keeps only its remaining cycles, so the next renewals stay discounted
 *   exactly as long as they would have been;
 * - a past_due subscription's open invoice stays open and is not charged a second time;
 * - a plan canceling at period end stays canceling: the recreated subscription keeps the old
 *   period end as its cancel date;
 * - a send_invoice subscription keeps its net terms and invoice payment method types.
 */

import { expect, test } from "bun:test";
import { ms, type SetPlansParamsV0Input, stripeRefToId } from "@autumn/shared";
import { driveProductPastDue } from "@tests/integration/billing/utils/driveProductPastDue";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import { s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import type Stripe from "stripe";
import {
	expectEachPeriodBilledOnce,
	expectRecreatedSubscriptionCorrect,
	expectReplacedSubscriptionCancelledQuietly,
	initLiveProScenario,
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
		const { pro, customerId, autumnV2_4, ctx, testClockId, advancedTo } =
			await initLiveProScenario({
				customerId: "set-plans-backdate-live-coupon",
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
		expect(carriedCoupon?.id).toBe(
			`${coupon.id}_${live.subscription.id}_${REMAINING_COUPON_MONTHS}m`,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans backdate live: payment method, tax rates and metadata carry, as before every recreate carried them")}`,
	async () => {
		const { pro, customerId, autumnV2_4, ctx } = await initLiveProScenario({
			customerId: "set-plans-backdate-live-settings",
		});
		const live = await liveSubscriptionPeriod({ ctx, customerId });
		const paymentMethod = await ctx.stripeCli.paymentMethods.attach(
			"pm_card_mastercard",
			{ customer: stripeRefToId(live.subscription.customer) },
		);
		const taxRate = await ctx.stripeCli.taxRates.create({
			display_name: "VAT",
			percentage: 20,
			inclusive: true,
		});
		await ctx.stripeCli.subscriptions.update(live.subscription.id, {
			default_payment_method: paymentMethod.id,
			default_tax_rates: [taxRate.id],
			metadata: { team: "growth" },
		});

		const backdatedStart = live.startMs - ms.days(10);
		await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
			customer_id: customerId,
			phases: [{ starts_at: backdatedStart, plans: [{ plan_id: pro.id }] }],
		});

		const recreated = await expectRecreatedSubscriptionCorrect({
			ctx,
			customerId,
			replacedSubscriptionId: live.subscription.id,
			startMs: backdatedStart,
			periodEndMs: live.periodEndMs,
		});
		expect({
			paymentMethodId: stripeRefToId(recreated.default_payment_method),
			taxRateIds: recreated.default_tax_rates?.map(({ id }) => id),
			collectionMethod: recreated.collection_method,
			team: recreated.metadata.team,
		}).toEqual({
			paymentMethodId: paymentMethod.id,
			taxRateIds: [taxRate.id],
			collectionMethod: "charge_automatically",
			team: "growth",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans backdate live: a past_due subscription's open invoice stays open and isn't charged again")}`,
	async () => {
		const { pro, customerId, autumnV2_4, ctx, testClockId } =
			await initLiveProScenario({
				customerId: "set-plans-backdate-live-past-due",
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

test.concurrent(
	`${chalk.yellowBright("set-plans backdate live: a plan canceling at period end keeps its cancel date on the recreated subscription")}`,
	async () => {
		const { pro, customerId, autumnV2_4, ctx } = await initLiveProScenario({
			customerId: "set-plans-backdate-live-canceling",
			afterAttach: (livePro) => [
				s.updateSubscription({
					productId: livePro.id,
					cancelAction: "cancel_end_of_cycle",
				}),
			],
			advanceDays: 10,
		});
		const live = await liveSubscriptionPeriod({ ctx, customerId });
		expect(live.subscription.cancel_at).not.toBeNull();
		const backdatedStart = live.startMs - ms.days(10);

		await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
			customer_id: customerId,
			phases: [{ starts_at: backdatedStart, plans: [{ plan_id: pro.id }] }],
		});

		await expectReplacedSubscriptionCancelledQuietly({
			ctx,
			subscriptionId: live.subscription.id,
			invoiceCountBefore: live.invoiceCount,
		});
		await expectRecreatedSubscriptionCorrect({
			ctx,
			customerId,
			replacedSubscriptionId: live.subscription.id,
			startMs: backdatedStart,
			periodEndMs: live.periodEndMs,
			cancelAtMs: live.periodEndMs,
		});
		await expectCustomerProducts({
			customerId,
			autumn: autumnV2_4,
			canceling: [pro.id],
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

test.concurrent(
	`${chalk.yellowBright("set-plans backdate live: a send_invoice subscription keeps its net terms and payment method types")}`,
	async () => {
		const { pro, customerId, autumnV2_4, ctx } = await initLiveProScenario({
			customerId: "set-plans-backdate-live-send-invoice",
		});
		const live = await liveSubscriptionPeriod({ ctx, customerId });
		await ctx.stripeCli.subscriptions.update(live.subscription.id, {
			collection_method: "send_invoice",
			days_until_due: 14,
			payment_settings: { payment_method_types: ["card"] },
		});

		const backdatedStart = live.startMs - ms.days(10);
		await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
			customer_id: customerId,
			phases: [{ starts_at: backdatedStart, plans: [{ plan_id: pro.id }] }],
		});

		const recreated = await expectRecreatedSubscriptionCorrect({
			ctx,
			customerId,
			replacedSubscriptionId: live.subscription.id,
			startMs: backdatedStart,
			periodEndMs: live.periodEndMs,
		});
		expect({
			collectionMethod: recreated.collection_method,
			daysUntilDue: recreated.days_until_due,
			paymentMethodTypes: recreated.payment_settings?.payment_method_types,
		}).toEqual({
			collectionMethod: "send_invoice",
			daysUntilDue: 14,
			paymentMethodTypes: ["card"],
		});
	},
);
