import { describe, expect, test } from "bun:test";
import {
	addInterval,
	applyBackdatedLineItemAmount,
	BillingInterval,
	type BillingPeriod,
	getCycleEnd,
	type LineItemContext,
	ms,
	type Price,
} from "@autumn/shared";
import { contexts } from "@tests/utils/fixtures/db/contexts";
import { prices } from "@tests/utils/fixtures/db/prices";
import { getBackdatedLineItemContext } from "@/internal/billing/v2/utils/lineItems/getBackdatedLineItemContext";

const startsAt = Date.UTC(2026, 0, 1);
const intoThirdCycle =
	addInterval({
		from: startsAt,
		interval: BillingInterval.Month,
		intervalCount: 2,
	}) + ms.days(14);

const monthly = prices.createFixed({ id: "monthly" });
const billingPeriod: BillingPeriod = {
	start: addInterval({
		from: startsAt,
		interval: BillingInterval.Month,
		intervalCount: 2,
	}),
	end: addInterval({
		from: startsAt,
		interval: BillingInterval.Month,
		intervalCount: 3,
	}),
};

const backdateContext = ({
	currentEpochMs = intoThirdCycle,
}: {
	currentEpochMs?: number;
} = {}) => ({
	...contexts.createBilling({
		currentEpochMs,
		billingCycleAnchorMs: startsAt,
	}),
	subscriptionBackdateStartMs: startsAt,
});

const lineItemContext = ({
	cycleCount,
	direction = "charge",
	billingTiming = "in_advance",
}: {
	cycleCount?: number;
	direction?: LineItemContext["direction"];
	billingTiming?: LineItemContext["billingTiming"];
}): LineItemContext =>
	({
		direction,
		billingTiming,
		backdate: cycleCount ? { startsAt, cycleCount } : undefined,
	} as LineItemContext);

describe("backdated line item context", () => {
	test("derives the backdated period, snapped now and cycle count", () => {
		const backdatedContext = getBackdatedLineItemContext({
			price: monthly,
			billingContext: backdateContext(),
			billingPeriod,
			direction: "charge",
			billingTiming: "in_advance",
		});

		const expectedEnd = getCycleEnd({
			anchor: startsAt,
			interval: BillingInterval.Month,
			intervalCount: 1,
			now: intoThirdCycle,
			floor: startsAt,
		});

		expect(backdatedContext).toEqual({
			now: billingPeriod.start,
			effectivePeriod: { start: startsAt, end: expectedEnd },
			backdate: { startsAt, cycleCount: 3 },
		});
	});

	test("derives one full cycle before a full cycle has elapsed", () => {
		const currentEpochMs = startsAt + ms.days(14);
		const backdatedContext = getBackdatedLineItemContext({
			price: monthly,
			billingContext: backdateContext({
				currentEpochMs,
			}),
			billingPeriod: {
				start: startsAt,
				end: addInterval({
					from: startsAt,
					interval: BillingInterval.Month,
				}),
			},
			direction: "charge",
			billingTiming: "in_advance",
		});

		expect(backdatedContext?.backdate?.cycleCount).toBe(1);
		expect(backdatedContext?.effectivePeriod).toEqual({
			start: startsAt,
			end: getCycleEnd({
				anchor: startsAt,
				interval: BillingInterval.Month,
				intervalCount: 1,
				now: currentEpochMs,
				floor: startsAt,
			}),
		});
	});

	test("does not derive context without a backdated start", () => {
		const backdatedContext = getBackdatedLineItemContext({
			price: monthly,
			billingContext: contexts.createBilling({
				currentEpochMs: intoThirdCycle,
				billingCycleAnchorMs: startsAt,
			}),
			billingPeriod,
			direction: "charge",
			billingTiming: "in_advance",
		});

		expect(backdatedContext).toBeUndefined();
	});

	test("does not derive context for one-off prices", () => {
		const oneOff = prices.createOneOff({ id: "setup" });
		const backdatedContext = getBackdatedLineItemContext({
			price: oneOff as Price,
			billingContext: backdateContext(),
			billingPeriod,
			direction: "charge",
			billingTiming: "in_advance",
		});

		expect(backdatedContext).toBeUndefined();
	});

	test("does not derive context against an existing Stripe subscription", () => {
		const backdatedContext = getBackdatedLineItemContext({
			price: monthly,
			billingContext: {
				...backdateContext(),
				stripeSubscription: { id: "sub_existing" } as never,
			},
			billingPeriod,
			direction: "charge",
			billingTiming: "in_advance",
		});

		expect(backdatedContext).toBeUndefined();
	});

	test("does not derive context for refunds or arrears", () => {
		expect(
			getBackdatedLineItemContext({
				price: monthly,
				billingContext: backdateContext(),
				billingPeriod,
				direction: "refund",
				billingTiming: "in_advance",
			}),
		).toBeUndefined();

		expect(
			getBackdatedLineItemContext({
				price: monthly,
				billingContext: backdateContext(),
				billingPeriod,
				direction: "charge",
				billingTiming: "in_arrear",
			}),
		).toBeUndefined();
	});

	test("scales charge in-advance amounts from backdate context", () => {
		const result = applyBackdatedLineItemAmount({
			amount: 100,
			context: lineItemContext({ cycleCount: 3 }),
		});

		expect(result).toBe(300);
	});

	test("does not scale refunds or arrears amounts", () => {
		expect(
			applyBackdatedLineItemAmount({
				amount: 100,
				context: lineItemContext({ cycleCount: 3, direction: "refund" }),
			}),
		).toBe(100);

		expect(
			applyBackdatedLineItemAmount({
				amount: 100,
				context: lineItemContext({
					cycleCount: 3,
					billingTiming: "in_arrear",
				}),
			}),
		).toBe(100);
	});
});
