/**
 * proration_behavior decides whether a backdate over a live subscription bills the time before
 * that subscription started: not at all (none), pro rata (for an annual plan, its part of the
 * year), or every cycle it reaches in full. The time the live subscription paid is never billed
 * again. Restarting the cycle on the backdated start credits the unused paid time and charges the
 * restarted cycle on the same invoice as the gap.
 */

import { expect, test } from "bun:test";
import {
	BillingInterval,
	getCycleEnd,
	getCycleStart,
	ms,
	type SetPlansParamsV0Input,
} from "@autumn/shared";
import { expectPreviewWarning } from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import {
	type BackdateProrationBehavior,
	expectEachPeriodBilledOnce,
	expectedBackdateGapCharge,
	expectedRestOfCycle,
	expectRecreatedSubscriptionCorrect,
	expectReplacedSubscriptionCancelledQuietly,
	initLiveProScenario,
	liveSubscriptionPeriod,
} from "./utils/backdateLiveUtils";

const PRO_MONTHLY_PRICE = 20;
const PRO_ANNUAL_PRICE = 200;

const backdateLivePro = async ({
	customerId,
	daysBeforeLiveStart,
	prorationBehavior,
	restartsCycle = false,
}: {
	customerId: string;
	daysBeforeLiveStart: number;
	prorationBehavior: BackdateProrationBehavior;
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
		cyclePrice: PRO_MONTHLY_PRICE,
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
	`${chalk.yellowBright("set-plans backdate live: none leaves the time before the live start unbilled, charging nothing now")}`,
	async () => {
		const customerId = "set-plans-backdate-live-gap-none";
		const { autumnV1, autumnV2_4, ctx, live, backdatedStart, params } =
			await backdateLivePro({
				customerId,
				daysBeforeLiveStart: 20,
				prorationBehavior: "none",
			});

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(0);

		await autumnV2_4.billing.setPlans(params);

		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 2,
			latestTotal: 0,
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
				{ startMs: backdatedStart, endMs: live.startMs, total: 0 },
				{
					startMs: live.periodStartMs,
					endMs: live.periodEndMs,
					total: PRO_MONTHLY_PRICE,
				},
			],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans backdate live: an annual plan backdated before its start with prorate_immediately bills the gap's part of the year")}`,
	async () => {
		const customerId = "set-plans-backdate-live-gap-annual";
		const proAnnual = products.proAnnual({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV1, autumnV2_4, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proAnnual] }),
			],
			actions: [
				s.billing.attach({ productId: proAnnual.id }),
				s.advanceTestClock({ months: 2 }),
			],
		});
		const live = await liveSubscriptionPeriod({ ctx, customerId });
		const backdatedStart = live.startMs - ms.days(45);
		const gapCharge = expectedBackdateGapCharge({
			cyclePrice: PRO_ANNUAL_PRICE,
			interval: BillingInterval.Year,
			backdatedStartMs: backdatedStart,
			liveStartMs: live.startMs,
			prorationBehavior: "prorate_immediately",
		});
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			proration_behavior: "prorate_immediately",
			phases: [
				{ starts_at: backdatedStart, plans: [{ plan_id: proAnnual.id }] },
			],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBeCloseTo(gapCharge, 2);

		await autumnV2_4.billing.setPlans(params);

		await expectCustomerInvoiceCorrect({
			customerId,
			autumn: autumnV1,
			count: 2,
			latestTotal: gapCharge,
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
			renewalTotal: PRO_ANNUAL_PRICE,
		});
		await expectEachPeriodBilledOnce({
			ctx,
			customerId,
			periods: [
				{ startMs: backdatedStart, endMs: live.startMs, total: gapCharge },
				{
					startMs: live.periodStartMs,
					endMs: live.periodEndMs,
					total: PRO_ANNUAL_PRICE,
				},
			],
		});
	},
);

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
			cycleStartMs: getCycleStart({
				anchor: backdatedStart,
				interval: BillingInterval.Month,
				now: advancedTo,
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
