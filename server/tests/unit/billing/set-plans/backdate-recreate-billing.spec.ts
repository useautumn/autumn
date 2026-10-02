/**
 * A backdate over a live subscription bills the time before that subscription started per
 * proration_behavior, never the time it already paid for, and can restart the cycle on the
 * backdated start: the unused paid time is credited and the new cycle charged on one invoice.
 */

import { describe, expect, test } from "bun:test";
import {
	addInterval,
	type BillingBehavior,
	BillingInterval,
	BillingVersion,
	type CreateScheduleBillingContext,
	getCycleEnd,
	type LineItem,
	ms,
	msToSeconds,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { customerProducts } from "@tests/utils/fixtures/db/customerProducts";
import { prices } from "@tests/utils/fixtures/db/prices";
import { products } from "@tests/utils/fixtures/db/products";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import { setupKeptSubscriptionCycle } from "@/internal/billing/v2/actions/setPlans/setup/setupKeptSubscriptionCycle";
import { setupSetPlansTimeline } from "@/internal/billing/v2/actions/setPlans/setup/setupSetPlansTimeline";
import { computeSetPlansPlanFromContext } from "./setPlansTimelineHelpers";

const ctx = contexts.create({});
const NOW = Date.UTC(2026, 9, 2, 12);
const LIVE_START = NOW - ms.days(18);
const PERIOD_END = addInterval({
	from: LIVE_START,
	interval: BillingInterval.Month,
});
const MONTHLY_PRICE = 100;

const liveSubscription = {
	id: "sub_live",
	status: "active",
	start_date: msToSeconds(LIVE_START),
	billing_cycle_anchor: msToSeconds(LIVE_START),
	items: { data: [{ current_period_end: msToSeconds(PERIOD_END) }] },
} as Stripe.Subscription;

const monthsBefore = ({ from, months }: { from: number; months: number }) =>
	addInterval({
		from,
		interval: BillingInterval.Month,
		intervalCount: -months,
	});

/** The pro rata share of `cycles` monthly cycles ending at the live start that the gap covers. */
const proRataGapCharge = ({
	backdatedStart,
	cycles,
}: {
	backdatedStart: number;
	cycles: number;
}) =>
	new Decimal(MONTHLY_PRICE)
		.mul(cycles)
		.mul(LIVE_START - backdatedStart)
		.div(LIVE_START - monthsBefore({ from: LIVE_START, months: cycles }))
		.toNumber();

const backdatedPro = ({
	backdatedStart,
	prorationBehavior,
	restartsCycle = false,
}: {
	backdatedStart: number;
	prorationBehavior?: BillingBehavior;
	restartsCycle?: boolean;
}): CreateScheduleBillingContext => {
	const pro = products.createFull({
		id: "pro",
		prices: [prices.createFixed({ id: "price_pro" })],
	});
	const customerProduct = customerProducts.create({
		id: "cus_prod_pro",
		productId: pro.id,
		product: pro,
		subscriptionIds: [liveSubscription.id],
		startsAt: LIVE_START,
		customerPrices: [
			prices.createCustomer({
				price: pro.prices[0]!,
				customerProductId: "cus_prod_pro",
			}),
		],
	});
	const billingContext = contexts.createBilling({
		customerProducts: [customerProduct],
		fullProducts: [pro],
		currentEpochMs: NOW,
		billingVersion: BillingVersion.V2,
	});
	const backdatedContext: CreateScheduleBillingContext = {
		...billingContext,
		productContexts: [
			{
				fullProduct: pro,
				customPrices: [],
				customEnts: [],
				featureQuantities: [],
				fullCustomer: billingContext.fullCustomer,
				currentCustomerProduct: customerProduct,
			},
		],
		checkoutMode: null,
		immediatePhase: {
			starts_at: backdatedStart,
			plans: [{ plan_id: pro.id }],
			...(restartsCycle
				? { billing_cycle_anchor: "phase_start" as const }
				: {}),
		},
		futurePhases: [],
		scheduledPhaseContexts: [],
		replacedStripeSubscription: liveSubscription,
		subscriptionBackdateStartMs: backdatedStart,
	};

	return {
		...backdatedContext,
		...setupKeptSubscriptionCycle({
			billingContext: backdatedContext,
			timeline: setupSetPlansTimeline({
				ctx,
				billingContext: backdatedContext,
				params: { undeclared_plans: "end" },
			}),
			requestedProrationBehavior: prorationBehavior,
		}),
	};
};

const billedLines = (billingContext: CreateScheduleBillingContext) =>
	(
		computeSetPlansPlanFromContext({ ctx, billingContext }).autumnBillingPlan
			.lineItems ?? []
	).map((lineItem: LineItem) => ({
		direction: lineItem.context.direction,
		amount: lineItem.amount,
		effectivePeriod: lineItem.context.effectivePeriod,
	}));

describe(
	chalk.yellowBright(
		"set_plans backdate recreate: the gap before the live start",
	),
	() => {
		const tenDaysBack = LIVE_START - ms.days(10);
		const fortyDaysBack = LIVE_START - ms.days(40);

		test("omitted or none leaves the gap unbilled", () => {
			expect(
				billedLines(backdatedPro({ backdatedStart: tenDaysBack })),
			).toEqual([]);
			expect(
				billedLines(
					backdatedPro({
						backdatedStart: tenDaysBack,
						prorationBehavior: "none",
					}),
				),
			).toEqual([]);
		});

		test("prorate_immediately charges the gap pro rata, up to the live start", () => {
			const [gapLine, ...rest] = billedLines(
				backdatedPro({
					backdatedStart: tenDaysBack,
					prorationBehavior: "prorate_immediately",
				}),
			);
			expect(rest).toEqual([]);
			expect(gapLine?.direction).toBe("charge");
			expect(gapLine?.effectivePeriod).toEqual({
				start: tenDaysBack,
				end: LIVE_START,
			});
			expect(gapLine?.amount).toBeCloseTo(
				proRataGapCharge({ backdatedStart: tenDaysBack, cycles: 1 }),
				2,
			);
		});

		test("prorate_immediately over more than a cycle charges each whole cycle plus the part one", () => {
			const [gapLine] = billedLines(
				backdatedPro({
					backdatedStart: fortyDaysBack,
					prorationBehavior: "prorate_immediately",
				}),
			);
			expect(gapLine?.amount).toBeCloseTo(
				proRataGapCharge({ backdatedStart: fortyDaysBack, cycles: 2 }),
				2,
			);
		});

		test("bill_difference charges every cycle the gap reaches in full, like attach's backdate catch-up", () => {
			const billsCycles = (backdatedStart: number) =>
				billedLines(
					backdatedPro({
						backdatedStart,
						prorationBehavior: "bill_difference",
					}),
				).map(({ amount }) => amount);

			expect(billsCycles(tenDaysBack)).toEqual([MONTHLY_PRICE]);
			expect(billsCycles(fortyDaysBack)).toEqual([MONTHLY_PRICE * 2]);
		});

		test("a start after the live start has no gap, so nothing is billed", () => {
			expect(
				billedLines(
					backdatedPro({
						backdatedStart: LIVE_START + ms.days(5),
						prorationBehavior: "prorate_immediately",
					}),
				),
			).toEqual([]);
		});
	},
);

describe(
	chalk.yellowBright(
		"set_plans backdate recreate: restarting the cycle on the backdated start",
	),
	() => {
		const backdatedStart = LIVE_START - ms.days(10);
		const restartedRenewal = getCycleEnd({
			anchor: backdatedStart,
			interval: BillingInterval.Month,
			now: NOW,
		});

		test("the recreated subscription renews on the backdated start's cycle, not the live period end", () => {
			expect(
				backdatedPro({ backdatedStart, restartsCycle: true })
					.billingCycleAnchorMs,
			).toBe(restartedRenewal);
			expect(backdatedPro({ backdatedStart }).billingCycleAnchorMs).toBe(
				PERIOD_END,
			);
		});

		test("credits the unused paid time, charges the restarted cycle and bills the gap on one invoice", () => {
			const lines = billedLines(
				backdatedPro({
					backdatedStart,
					restartsCycle: true,
					prorationBehavior: "prorate_immediately",
				}),
			);
			const restartedCycleStart = monthsBefore({
				from: restartedRenewal,
				months: 1,
			});

			expect(
				lines.map(({ direction, effectivePeriod }) => [
					direction,
					effectivePeriod,
				]),
			).toEqual([
				["refund", { start: NOW, end: PERIOD_END }],
				["charge", { start: NOW, end: restartedRenewal }],
				["charge", { start: backdatedStart, end: LIVE_START }],
			]);
			const [credit, restartCharge, gapCharge] = lines.map(
				({ amount }) => amount,
			);
			expect(credit).toBeCloseTo(
				new Decimal(-MONTHLY_PRICE)
					.mul(PERIOD_END - NOW)
					.div(PERIOD_END - LIVE_START)
					.toNumber(),
				2,
			);
			expect(restartCharge).toBeCloseTo(
				new Decimal(MONTHLY_PRICE)
					.mul(restartedRenewal - NOW)
					.div(restartedRenewal - restartedCycleStart)
					.toNumber(),
				2,
			);
			expect(gapCharge).toBeCloseTo(
				proRataGapCharge({ backdatedStart, cycles: 1 }),
				2,
			);
		});

		test("none restarts the cycle without any charge or credit", () => {
			expect(
				billedLines(
					backdatedPro({
						backdatedStart,
						restartsCycle: true,
						prorationBehavior: "none",
					}),
				),
			).toEqual([]);
		});
	},
);
