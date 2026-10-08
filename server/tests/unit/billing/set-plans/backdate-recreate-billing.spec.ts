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
	type FullCustomerLicense,
	type FullPlanLicense,
	type FullProduct,
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

const premium = products.createFull({
	id: "premium",
	prices: [prices.createFixed({ id: "price_premium" })],
});

const premiumPhaseFrom = (startsAt: number) => ({
	futurePhases: [{ starts_at: startsAt, plans: [{ plan_id: premium.id }] }],
	scheduledPhaseContexts: [
		{
			startsAt,
			endsAt: undefined,
			productContexts: [
				{
					fullProduct: premium,
					customPrices: [],
					customEntitlements: [],
					featureQuantities: [],
				},
			],
		} as CreateScheduleBillingContext["scheduledPhaseContexts"][number],
	],
});

const SEAT_PRICE = 10;

const seatProduct = products.createFull({
	id: "seat",
	prices: [
		prices.buildFixed({
			overrides: { id: "price_seat" },
			configOverrides: { amount: SEAT_PRICE },
		}),
	],
});

const seatPlanLicense: FullPlanLicense = {
	id: "plan_lic_seat",
	parent_internal_product_id: "prod_internal_pro",
	is_custom: false,
	license_internal_product_id: seatProduct.internal_id,
	included: 0,
	prepaid_only: false,
	customized: false,
	metadata: null,
	created_at: LIVE_START,
	updated_at: LIVE_START,
	product: seatProduct,
};

const oneOffSeatProduct = products.createFull({
	id: "seat_one_off",
	prices: [
		prices.buildFixed({
			overrides: { id: "price_seat_one_off" },
			configOverrides: { amount: SEAT_PRICE, interval: BillingInterval.OneOff },
		}),
	],
});

const oneOffSeatPlanLicense: FullPlanLicense = {
	...seatPlanLicense,
	id: "plan_lic_seat_one_off",
	license_internal_product_id: oneOffSeatProduct.internal_id,
	product: oneOffSeatProduct,
};

const paidSeats = ({
	paidQuantity,
	planLicense,
}: {
	paidQuantity: number;
	planLicense: FullPlanLicense;
}): FullCustomerLicense[] => [
	{
		id: "cus_lic_seat",
		link_id: "cus_lic_seat",
		internal_customer_id: "cus_internal",
		parent_customer_product_id: "cus_prod_pro",
		license_internal_product_id: planLicense.license_internal_product_id,
		plan_license_id: planLicense.id,
		granted: paidQuantity,
		remaining: paidQuantity,
		paid_quantity: paidQuantity,
		created_at: LIVE_START,
		updated_at: LIVE_START,
		planLicense,
	},
];

const backdatedPro = ({
	backdatedStart,
	prorationBehavior,
	restartsCycle = false,
	premiumStartsAt,
	paidSeatCount,
	planLicense = seatPlanLicense,
}: {
	backdatedStart: number;
	prorationBehavior?: BillingBehavior;
	restartsCycle?: boolean;
	premiumStartsAt?: number;
	paidSeatCount?: number;
	planLicense?: FullPlanLicense;
}): CreateScheduleBillingContext => {
	const plainPro = products.createFull({
		id: "pro",
		prices: [prices.createFixed({ id: "price_pro" })],
	});
	const pro: FullProduct =
		paidSeatCount === undefined
			? plainPro
			: { ...plainPro, licenses: [planLicense] };
	const baseCustomerProduct = customerProducts.create({
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
	const customerProduct =
		paidSeatCount === undefined
			? baseCustomerProduct
			: {
					...baseCustomerProduct,
					customer_licenses: paidSeats({
						paidQuantity: paidSeatCount,
						planLicense,
					}),
				};
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
				...(paidSeatCount !== undefined && {
					customerLicenseQuantities: [
						{
							licensePlanId: planLicense.product.id,
							totalQuantity: paidSeatCount,
						},
					],
				}),
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
		...(premiumStartsAt === undefined
			? { futurePhases: [], scheduledPhaseContexts: [] }
			: premiumPhaseFrom(premiumStartsAt)),
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

		test("none leaves the gap unbilled; omitted bills it like prorate_immediately, attach's default", () => {
			expect(
				billedLines(backdatedPro({ backdatedStart: tenDaysBack })),
			).toEqual(
				billedLines(
					backdatedPro({
						backdatedStart: tenDaysBack,
						prorationBehavior: "prorate_immediately",
					}),
				),
			);
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
			const lines = billedLines(
				backdatedPro({
					backdatedStart: fortyDaysBack,
					prorationBehavior: "prorate_immediately",
				}),
			);
			expect(lines).toHaveLength(1);
			expect(lines[0]?.direction).toBe("charge");
			expect(lines[0]?.effectivePeriod).toEqual({
				start: fortyDaysBack,
				end: LIVE_START,
			});
			expect(lines[0]?.amount).toBeCloseTo(
				proRataGapCharge({ backdatedStart: fortyDaysBack, cycles: 2 }),
				2,
			);
		});

		test("a plan from a later phase starting inside the gap is billed only from its own start", () => {
			const premiumStart = LIVE_START - ms.days(20);
			const gapPeriods = billedLines(
				backdatedPro({
					backdatedStart: fortyDaysBack,
					prorationBehavior: "prorate_immediately",
					premiumStartsAt: premiumStart,
				}),
			)
				.map(({ effectivePeriod }) => effectivePeriod)
				.filter((period) => period !== undefined && period.end <= LIVE_START);

			expect(gapPeriods).toEqual([{ start: premiumStart, end: LIVE_START }]);
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

const billedLinesByPrice = (billingContext: CreateScheduleBillingContext) =>
	(
		computeSetPlansPlanFromContext({ ctx, billingContext }).autumnBillingPlan
			.lineItems ?? []
	).map((lineItem: LineItem) => ({
		priceId: lineItem.context.price.id,
		quantity: lineItem.paidQuantity,
		amount: lineItem.amount,
		effectivePeriod: lineItem.context.effectivePeriod,
		backdated: lineItem.context.backdate !== undefined,
	}));

describe(
	chalk.yellowBright(
		"set_plans backdate recreate: paid seats over the gap before the live start",
	),
	() => {
		const PAID_SEATS = 5;
		const tenDaysBack = LIVE_START - ms.days(10);
		const fortyDaysBack = LIVE_START - ms.days(40);
		const gapPeriod = (backdatedStart: number) => ({
			start: backdatedStart,
			end: LIVE_START,
		});

		test("prorate_immediately bills the paid seats pro rata over the gap, alongside the base price", () => {
			const lines = billedLinesByPrice(
				backdatedPro({
					backdatedStart: tenDaysBack,
					prorationBehavior: "prorate_immediately",
					paidSeatCount: PAID_SEATS,
				}),
			);
			const proRataShare =
				proRataGapCharge({ backdatedStart: tenDaysBack, cycles: 1 }) /
				MONTHLY_PRICE;

			expect(lines.map(({ priceId }) => priceId)).toEqual([
				"price_pro",
				"price_seat",
			]);
			const seatLine = lines[1];
			expect(seatLine?.quantity).toBe(PAID_SEATS);
			expect(seatLine?.backdated).toBe(true);
			expect(seatLine?.effectivePeriod).toEqual(gapPeriod(tenDaysBack));
			expect(seatLine?.amount).toBeCloseTo(
				PAID_SEATS * SEAT_PRICE * proRataShare,
				2,
			);
		});

		test("prorate_immediately over more than a cycle bills the seats for each cycle the gap reaches", () => {
			const seatLines = billedLinesByPrice(
				backdatedPro({
					backdatedStart: fortyDaysBack,
					prorationBehavior: "prorate_immediately",
					paidSeatCount: PAID_SEATS,
				}),
			).filter(({ priceId }) => priceId === "price_seat");
			expect(seatLines).toHaveLength(1);
			const [seatLine] = seatLines;

			expect(seatLine?.effectivePeriod).toEqual(gapPeriod(fortyDaysBack));
			expect(seatLine?.amount).toBeCloseTo(
				(PAID_SEATS *
					SEAT_PRICE *
					proRataGapCharge({ backdatedStart: fortyDaysBack, cycles: 2 })) /
					MONTHLY_PRICE,
				2,
			);
		});

		test("bill_difference bills the paid seats for every cycle the gap reaches in full", () => {
			const billsCycles = (backdatedStart: number) =>
				billedLinesByPrice(
					backdatedPro({
						backdatedStart,
						prorationBehavior: "bill_difference",
						paidSeatCount: PAID_SEATS,
					}),
				).map(({ priceId, amount }) => [priceId, amount]);

			expect(billsCycles(tenDaysBack)).toEqual([
				["price_pro", MONTHLY_PRICE],
				["price_seat", PAID_SEATS * SEAT_PRICE],
			]);
			expect(billsCycles(fortyDaysBack)).toEqual([
				["price_pro", MONTHLY_PRICE * 2],
				["price_seat", PAID_SEATS * SEAT_PRICE * 2],
			]);
		});

		test("one-off seats are not billed again for the gap", () => {
			const lines = billedLinesByPrice(
				backdatedPro({
					backdatedStart: tenDaysBack,
					prorationBehavior: "prorate_immediately",
					paidSeatCount: PAID_SEATS,
					planLicense: oneOffSeatPlanLicense,
				}),
			);

			expect(lines.map(({ priceId }) => priceId)).toEqual(["price_pro"]);
		});

		test("none bills neither the plan nor its seats for the gap", () => {
			expect(
				billedLinesByPrice(
					backdatedPro({
						backdatedStart: tenDaysBack,
						prorationBehavior: "none",
						paidSeatCount: PAID_SEATS,
					}),
				),
			).toEqual([]);
		});

		test("restarting the cycle credits, charges and bills the gap for the seats exactly as for the base price", () => {
			const lines = billedLinesByPrice(
				backdatedPro({
					backdatedStart: tenDaysBack,
					restartsCycle: true,
					prorationBehavior: "prorate_immediately",
					paidSeatCount: PAID_SEATS,
				}),
			);
			const linesFor = (priceId: string) =>
				lines.filter((line) => line.priceId === priceId);
			const seatToBaseRatio = (PAID_SEATS * SEAT_PRICE) / MONTHLY_PRICE;

			expect(
				linesFor("price_seat").map(({ effectivePeriod, backdated }) => ({
					effectivePeriod,
					backdated,
				})),
			).toEqual(
				linesFor("price_pro").map(({ effectivePeriod, backdated }) => ({
					effectivePeriod,
					backdated,
				})),
			);
			const baseLines = linesFor("price_pro");
			for (const [index, seatLine] of linesFor("price_seat").entries()) {
				expect(seatLine.quantity).toBe(PAID_SEATS);
				expect(seatLine.amount).toBeCloseTo(
					(baseLines[index]?.amount ?? 0) * seatToBaseRatio,
					2,
				);
			}
			expect(
				linesFor("price_seat").filter(({ backdated }) => backdated),
			).toHaveLength(1);
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
