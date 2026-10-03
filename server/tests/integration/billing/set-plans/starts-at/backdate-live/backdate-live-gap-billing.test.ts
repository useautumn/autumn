/**
 * proration_behavior decides whether a backdate over a live subscription bills the time before
 * that subscription started: pro rata, or every cycle it reaches in full. The time the live
 * subscription paid is never billed again. Restarting the cycle on the backdated start credits
 * the unused paid time and charges the restarted cycle on the same invoice as the gap.
 */

import { expect, test } from "bun:test";
import {
	addInterval,
	BillingInterval,
	getCycleEnd,
	ms,
	type SetPlansParamsV0Input,
} from "@autumn/shared";
import { expectPreviewWarning } from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import {
	expectEachPeriodBilledOnce,
	expectedBackdateGapCharge,
	expectedRestOfCycle,
	expectRecreatedSubscriptionCorrect,
	expectReplacedSubscriptionCancelledQuietly,
	initLiveProScenario,
	liveSubscriptionPeriod,
} from "./utils/backdateLiveUtils";

const PRO_MONTHLY_PRICE = 20;

const backdateLivePro = async ({
	customerId,
	daysBeforeLiveStart,
	prorationBehavior,
	restartsCycle = false,
}: {
	customerId: string;
	daysBeforeLiveStart: number;
	prorationBehavior: "prorate_immediately" | "bill_difference";
	restartsCycle?: boolean;
}) => {
	const scenario = await initLiveProScenario({ customerId, advanceDays: 10 });
	const live = await liveSubscriptionPeriod({ ctx: scenario.ctx, customerId });
	const backdatedStart = live.startMs - ms.days(daysBeforeLiveStart);
	const params: SetPlansParamsV0Input = {
		customer_id: customerId,
		proration_behavior: prorationBehavior,
		phases: [
			{
				starts_at: backdatedStart,
				plans: [{ plan_id: scenario.pro.id }],
				...(restartsCycle ? { billing_cycle_anchor: "phase_start" } : {}),
			},
		],
	};
	const gapCharge = expectedBackdateGapCharge({
		monthlyPrice: PRO_MONTHLY_PRICE,
		backdatedStartMs: backdatedStart,
		liveStartMs: live.startMs,
		prorationBehavior,
	});
	return { ...scenario, live, backdatedStart, params, gapCharge };
};

for (const { prorationBehavior, daysBeforeLiveStart } of [
	{ prorationBehavior: "prorate_immediately", daysBeforeLiveStart: 10 },
	{ prorationBehavior: "bill_difference", daysBeforeLiveStart: 40 },
] as const) {
	test.concurrent(
		`${chalk.yellowBright(`set-plans backdate live: ${prorationBehavior} bills the ${daysBeforeLiveStart} days before the live start once`)}`,
		async () => {
			const customerId = `set-plans-backdate-live-gap-${prorationBehavior}`;
			const {
				autumnV1,
				autumnV2_4,
				ctx,
				live,
				backdatedStart,
				params,
				gapCharge,
			} = await backdateLivePro({
				customerId,
				daysBeforeLiveStart,
				prorationBehavior,
			});

			const preview = await autumnV2_4.billing.previewSetPlans(params);
			expect(preview.total).toBeCloseTo(gapCharge, 2);
			expectPreviewWarning({
				preview,
				type: "subscription_recreated_backdated",
				messageContains: ["is billed now for the time before"],
			});

			await autumnV2_4.billing.setPlans(params);

			await expectCustomerInvoiceCorrect({
				customerId,
				autumn: autumnV1,
				count: 2,
				latestTotal: preview.total,
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
				renewalTotal: PRO_MONTHLY_PRICE,
			});
			await expectEachPeriodBilledOnce({
				ctx,
				customerId,
				periods: [
					{ startMs: backdatedStart, endMs: live.startMs, total: gapCharge },
					{
						startMs: live.periodStartMs,
						endMs: live.periodEndMs,
						total: PRO_MONTHLY_PRICE,
					},
				],
			});
		},
	);
}

test.concurrent(
	`${chalk.yellowBright("set-plans backdate live: restarting the cycle on the backdated start credits the paid time and charges the new cycle with the gap")}`,
	async () => {
		const customerId = "set-plans-backdate-live-gap-restart";
		const {
			autumnV1,
			autumnV2_4,
			ctx,
			live,
			backdatedStart,
			params,
			gapCharge,
			advancedTo,
		} = await backdateLivePro({
			customerId,
			daysBeforeLiveStart: 10,
			prorationBehavior: "prorate_immediately",
			restartsCycle: true,
		});
		const restartedRenewalMs = getCycleEnd({
			anchor: backdatedStart,
			interval: BillingInterval.Month,
			now: advancedTo,
		});
		const unusedPaidTime = expectedRestOfCycle({
			monthlyPrice: PRO_MONTHLY_PRICE,
			nowMs: advancedTo,
			cycleStartMs: live.periodStartMs,
			cycleEndMs: live.periodEndMs,
		});
		const restartedCycleCharge = expectedRestOfCycle({
			monthlyPrice: PRO_MONTHLY_PRICE,
			nowMs: advancedTo,
			cycleStartMs: addInterval({
				from: restartedRenewalMs,
				interval: BillingInterval.Month,
				intervalCount: -1,
			}),
			cycleEndMs: restartedRenewalMs,
		});

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBeCloseTo(
			new Decimal(gapCharge)
				.plus(restartedCycleCharge)
				.minus(unusedPaidTime)
				.toNumber(),
			2,
		);
		expectPreviewWarning({
			preview,
			type: "subscription_recreated_backdated",
			messageContains: ["The billing cycle restarts from"],
		});

		await autumnV2_4.billing.setPlans(params);

		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 2,
			latestTotal: preview.total,
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
			periodEndMs: restartedRenewalMs,
			renewalTotal: PRO_MONTHLY_PRICE,
		});
		await expectEachPeriodBilledOnce({
			ctx,
			customerId,
			periods: [
				{ startMs: backdatedStart, endMs: live.startMs, total: gapCharge },
			],
		});
	},
);
