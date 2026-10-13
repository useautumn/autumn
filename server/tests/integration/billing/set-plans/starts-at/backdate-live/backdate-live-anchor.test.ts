/**
 * A backdate over a paid live subscription with a billing_cycle_anchor off its paid-through date P bills the unpaid
 * backdated time as before, then settles P against the anchor A like a live anchor move, so no day is billed twice:
 * - A after P: prorate bills the stub P → A now; none leaves P → A unbilled. Both charge in full on A.
 * - A before P: prorate credits the paid A → P now, against the charge on A; none credits nothing.
 * Stripe's own create would bill S → A again over the paid month (handoffs/ATMN-812 probe), so the recreated
 * subscription is created with no proration and Autumn invoices the settlement.
 *
 * Red (before):  400 "The billing cycle anchor can't change when backdating to".
 * Green (after): preview == Autumn invoice; one full charge on A.
 */

import { expect, test } from "bun:test";
import { ms, type SetPlansParamsV0Input } from "@autumn/shared";
import { advancePastCycleStart } from "@tests/integration/billing/set-plans/billing-cycle-anchor/utils/anchorCycleUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import {
	calculateNewSubscriptionAnchorStub,
	calculateProrationFromPeriod,
} from "@tests/integration/billing/utils/proration";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import {
	type BackdateProrationBehavior,
	expectedBackdateGapCharge,
	expectRecreatedSubscriptionCorrect,
	expectReplacedSubscriptionCancelledQuietly,
	initLiveProScenario,
	liveSubscriptionPeriod,
} from "./utils/backdateLiveUtils";

const PRO_MONTHLY_PRICE = 20;
const DAYS_BEFORE_LIVE_START = 10;
const ANCHOR_SHIFT_DAYS = 10;

/** What moving the anchor off the paid-through date settles now: the stub to a later anchor, or the paid time after an earlier one. */
const expectedAnchorSettlement = ({
	anchorMs,
	paidThroughMs,
	periodStartMs,
	prorationBehavior,
}: {
	anchorMs: number;
	paidThroughMs: number;
	periodStartMs: number;
	prorationBehavior: BackdateProrationBehavior;
}) => {
	if (prorationBehavior === "none") return 0;
	if (anchorMs > paidThroughMs) {
		return calculateNewSubscriptionAnchorStub({
			advancedTo: paidThroughMs,
			anchorMs,
			amount: PRO_MONTHLY_PRICE,
		});
	}
	return -calculateProrationFromPeriod({
		billingPeriod: { start: periodStartMs, end: paidThroughMs },
		advancedTo: anchorMs,
		amount: PRO_MONTHLY_PRICE,
	});
};

for (const anchorSide of ["after", "before"] as const) {
	for (const prorationBehavior of [
		"prorate_immediately",
		"none",
	] as const satisfies BackdateProrationBehavior[]) {
		test.concurrent(
			`${chalk.yellowBright(`set-plans backdate live: an anchor ${anchorSide} the paid-through date under ${prorationBehavior} bills each day once`)}`,
			async () => {
				const customerId = `sp-bd-live-anchor-${anchorSide}-${prorationBehavior}`;
				const { pro, autumnV1, autumnV2_4, ctx, testClockId } =
					await initLiveProScenario({ customerId, advanceDays: 10 });
				const live = await liveSubscriptionPeriod({ ctx, customerId });
				const backdatedStart = live.startMs - ms.days(DAYS_BEFORE_LIVE_START);
				const anchorMs =
					anchorSide === "after"
						? live.periodEndMs + ms.days(ANCHOR_SHIFT_DAYS)
						: live.periodEndMs - ms.days(ANCHOR_SHIFT_DAYS);
				const params: SetPlansParamsV0Input = {
					customer_id: customerId,
					phases: [
						{
							starts_at: backdatedStart,
							billing_cycle_anchor: anchorMs,
							proration_behavior: prorationBehavior,
							plans: [{ plan_id: pro.id }],
						},
					],
				};
				const chargeNow = new Decimal(
					expectedBackdateGapCharge({
						cyclePrice: PRO_MONTHLY_PRICE,
						backdatedStartMs: backdatedStart,
						liveStartMs: live.startMs,
						prorationBehavior,
					}),
				)
					.plus(
						expectedAnchorSettlement({
							anchorMs,
							paidThroughMs: live.periodEndMs,
							periodStartMs: live.periodStartMs,
							prorationBehavior,
						}),
					)
					.toDecimalPlaces(2)
					.toNumber();

				const preview = await autumnV2_4.billing.previewSetPlans(params);
				expect(preview.total).toBeCloseTo(chargeNow, 2);
				expectPreviewNextCycleCorrect({
					preview,
					startsAt: anchorMs,
					total: PRO_MONTHLY_PRICE,
					toleranceMs: 1000,
				});

				await autumnV2_4.billing.setPlans(params);

				await expectReplacedSubscriptionCancelledQuietly({
					ctx,
					subscriptionId: live.subscription.id,
					invoiceCountBefore: live.invoiceCount,
				});
				const recreated = await expectRecreatedSubscriptionCorrect({
					ctx,
					customerId,
					replacedSubscriptionId: live.subscription.id,
					startMs: backdatedStart,
					periodEndMs: anchorMs,
					renewalTotal: PRO_MONTHLY_PRICE,
				});
				await expectCustomerInvoiceCorrect({
					customerId,
					autumn: autumnV1,
					count: live.invoiceCount + (chargeNow === 0 ? 0 : 1),
					latestTotal: chargeNow === 0 ? live.billedTotal : chargeNow,
				});

				await advancePastCycleStart({
					ctx,
					testClockId: testClockId!,
					cycleStartsAt: anchorMs,
				});
				// Stripe's create bills nothing (any settlement is Autumn's own invoice); A bills one full cycle.
				const { data: invoices } = await ctx.stripeCli.invoices.list({
					subscription: recreated.id,
				});
				expect(
					invoices
						.filter(({ billing_reason }) => billing_reason !== "manual")
						.map(({ billing_reason, total }) => ({ billing_reason, total })),
				).toEqual([
					{
						billing_reason: "subscription_cycle",
						total: PRO_MONTHLY_PRICE * 100,
					},
				]);
			},
		);
	}
}
