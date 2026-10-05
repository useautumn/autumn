/**
 * set_plans treats a phases[0].starts_at within SET_PLANS_FIRST_PHASE_TOLERANCE_MS (15 min) of now as now:
 * - 10 min ahead starts the plan immediately and bills it, with no schedule; 20 min ahead is a future start;
 * - 10 min back over a live subscription changes nothing; 20 min back recreates it from that start.
 */

import { expect, test } from "bun:test";
import {
	CusProductStatus,
	ms,
	type SetPlansParamsV0Input,
} from "@autumn/shared";
import { findStripeSubscriptionByStatus } from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import {
	expectRecreatedSubscriptionCorrect,
	expectReplacedSubscriptionCancelledQuietly,
	initLiveProScenario,
	liveSubscriptionPeriod,
} from "./backdate-live/utils/backdateLiveUtils";
import {
	expectFutureStartScheduleCorrect,
	expectPendingSchedules,
	findLiveCustomerProduct,
	startsAtProducts,
	testClockNowMs,
} from "./utils/futureStartUtils";

const WITHIN_TOLERANCE_MS = ms.minutes(10);
const BEYOND_TOLERANCE_MS = ms.minutes(20);
const PRO_MONTHLY_PRICE = 20;

const startPlanParams = ({
	customerId,
	planId,
	startsAt,
}: {
	customerId: string;
	planId: string;
	startsAt: number;
}): SetPlansParamsV0Input => ({
	customer_id: customerId,
	phases: [{ starts_at: startsAt, plans: [{ plan_id: planId }] }],
});

test.concurrent(
	`${chalk.yellowBright("set-plans starts_at tolerance: 10 min ahead starts now, 20 min ahead is a future start")}`,
	async () => {
		const { pro, premium } = startsAtProducts();
		const { customerId, autumnV1, autumnV2_4, ctx, testClockId } =
			await initScenario({
				customerId: "set-plans-starts-at-tolerance-future",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro, premium] }),
				],
				actions: [],
			});
		const nowMs = await testClockNowMs({ ctx, testClockId: testClockId! });

		await autumnV2_4.billing.setPlans(
			startPlanParams({
				customerId,
				planId: pro.id,
				startsAt: nowMs + WITHIN_TOLERANCE_MS,
			}),
		);

		const startedPro = await findLiveCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(startedPro.status).toBe(CusProductStatus.Active);
		expect(startedPro.scheduled_ids ?? []).toEqual([]);
		await expectPendingSchedules({ ctx, customerId, scheduleIds: [] });
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 1,
			latestTotal: PRO_MONTHLY_PRICE,
		});

		const futureStart = nowMs + BEYOND_TOLERANCE_MS;
		await autumnV2_4.billing.setPlans(
			startPlanParams({
				customerId,
				planId: premium.id,
				startsAt: futureStart,
			}),
		);

		const scheduledPremium = await findLiveCustomerProduct({
			ctx,
			customerId,
			productId: premium.id,
		});
		expect(scheduledPremium.status).toBe(CusProductStatus.Scheduled);
		const schedule = await expectFutureStartScheduleCorrect({
			ctx,
			customerProduct: scheduledPremium,
			startsAt: futureStart,
		});
		await expectPendingSchedules({
			ctx,
			customerId,
			scheduleIds: [schedule.id],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans starts_at tolerance: 10 min back over a live subscription is not a backdate, 20 min back recreates it")}`,
	async () => {
		const { pro, customerId, autumnV1, autumnV2_4, ctx, testClockId } =
			await initLiveProScenario({
				customerId: "set-plans-starts-at-tolerance-backdate",
			});
		const live = await liveSubscriptionPeriod({ ctx, customerId });
		const nowMs = await testClockNowMs({ ctx, testClockId: testClockId! });
		const rowBefore = await findLiveCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});

		await autumnV2_4.billing.setPlans(
			startPlanParams({
				customerId,
				planId: pro.id,
				startsAt: nowMs - WITHIN_TOLERANCE_MS,
			}),
		);

		const keptSubscription = await findStripeSubscriptionByStatus({
			ctx,
			customerId,
			status: "active",
		});
		expect(keptSubscription.id).toBe(live.subscription.id);
		const keptRow = await findLiveCustomerProduct({
			ctx,
			customerId,
			productId: pro.id,
		});
		expect(keptRow.id).toBe(rowBefore.id);
		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: live.invoiceCount,
			latestTotal: PRO_MONTHLY_PRICE,
		});

		const backdatedStart = nowMs - BEYOND_TOLERANCE_MS;
		await autumnV2_4.billing.setPlans(
			startPlanParams({ customerId, planId: pro.id, startsAt: backdatedStart }),
		);

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
	},
);
