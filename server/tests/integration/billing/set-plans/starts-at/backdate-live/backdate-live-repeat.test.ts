/**
 * Backdating a live subscription a second time, then re-saving it unchanged:
 * - the second backdate bills only the time it adds before the first backdated start, never the
 *   gap the first backdate already billed or the period the original subscription paid;
 * - re-saving the same request is a no-op: the same subscription and row, and no new invoice.
 */

import { expect, test } from "bun:test";
import { ms, type SetPlansParamsV0Input } from "@autumn/shared";
import { findStripeSubscriptionByStatus } from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import chalk from "chalk";
import { findLiveCustomerProduct } from "../utils/futureStartUtils";
import {
	expectEachPeriodBilledOnce,
	expectedBackdateGapCharge,
	expectRecreatedSubscriptionCorrect,
	expectReplacedSubscriptionCancelledQuietly,
	initLiveProScenario,
	liveSubscriptionPeriod,
} from "./utils/backdateLiveUtils";

const PRO_MONTHLY_PRICE = 20;
const DAYS_PER_BACKDATE = 10;

const backdateProParams = ({
	customerId,
	planId,
	startsAt,
}: {
	customerId: string;
	planId: string;
	startsAt: number;
}): SetPlansParamsV0Input => ({
	customer_id: customerId,
	phases: [
		{
			proration_behavior: "prorate_immediately",
			starts_at: startsAt,
			plans: [{ plan_id: planId }],
		},
	],
});

test.concurrent(
	`${chalk.yellowBright("set-plans backdate live: a second, earlier backdate bills only the time it adds, and an unchanged re-save is a no-op")}`,
	async () => {
		const { pro, customerId, autumnV1, autumnV2_4, ctx } =
			await initLiveProScenario({
				customerId: "set-plans-backdate-live-repeat",
				advanceDays: 10,
			});
		const original = await liveSubscriptionPeriod({ ctx, customerId });
		const firstStart = original.startMs - ms.days(DAYS_PER_BACKDATE);
		const secondStart = firstStart - ms.days(DAYS_PER_BACKDATE);
		const firstGapCharge = expectedBackdateGapCharge({
			cyclePrice: PRO_MONTHLY_PRICE,
			backdatedStartMs: firstStart,
			liveStartMs: original.startMs,
			prorationBehavior: "prorate_immediately",
		});
		const secondGapCharge = expectedBackdateGapCharge({
			cyclePrice: PRO_MONTHLY_PRICE,
			backdatedStartMs: secondStart,
			liveStartMs: firstStart,
			prorationBehavior: "prorate_immediately",
		});

		await autumnV2_4.billing.setPlans(
			backdateProParams({ customerId, planId: pro.id, startsAt: firstStart }),
		);
		const firstRecreate = await liveSubscriptionPeriod({ ctx, customerId });
		expect(firstRecreate.startMs).toBe(firstStart);

		const secondParams = backdateProParams({
			customerId,
			planId: pro.id,
			startsAt: secondStart,
		});
		await autumnV2_4.billing.setPlans(secondParams);

		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 3,
			latestTotal: secondGapCharge,
		});
		await expectReplacedSubscriptionCancelledQuietly({
			ctx,
			subscriptionId: firstRecreate.subscription.id,
			invoiceCountBefore: firstRecreate.invoiceCount,
		});
		const secondRecreate = await expectRecreatedSubscriptionCorrect({
			ctx,
			customerId,
			replacedSubscriptionId: firstRecreate.subscription.id,
			startMs: secondStart,
			periodEndMs: original.periodEndMs,
			renewalTotal: PRO_MONTHLY_PRICE,
		});
		const rowBeforeResave = await findLiveCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});

		await autumnV2_4.billing.setPlans(secondParams);

		const liveAfterResave = await findStripeSubscriptionByStatus({
			ctx,
			customerId,
			status: "active",
		});
		expect(liveAfterResave.id).toBe(secondRecreate.id);
		const rowAfterResave = await findLiveCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(rowAfterResave.id).toBe(rowBeforeResave.id);
		expect(rowAfterResave.subscription_ids).toEqual([secondRecreate.id]);
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 3,
			latestTotal: secondGapCharge,
		});
		await expectEachPeriodBilledOnce({
			ctx,
			customerId,
			periods: [
				{ startMs: secondStart, endMs: firstStart, total: secondGapCharge },
				{
					startMs: firstStart,
					endMs: original.startMs,
					total: firstGapCharge,
				},
				{
					startMs: original.periodStartMs,
					endMs: original.periodEndMs,
					total: PRO_MONTHLY_PRICE,
				},
			],
		});
	},
);
