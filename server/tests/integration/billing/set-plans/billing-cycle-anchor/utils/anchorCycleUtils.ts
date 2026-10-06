import { expect } from "bun:test";
import { msToSeconds } from "@autumn/shared";
import { getBillingPeriod } from "@tests/integration/billing/utils/proration";
import { hoursToFinalizeInvoice } from "@tests/utils/constants";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { addHours } from "date-fns";
import { Decimal } from "decimal.js";
import { findStripeSubscriptionByStatus } from "../../utils/subscriptionStateUtils";

/** The live Stripe subscription's cycle, to the second: its anchor (when given) and the current period's end. */
export const expectStripeCycleCorrect = async ({
	ctx,
	customerId,
	anchorMs,
	periodEndMs,
}: {
	ctx: TestContext;
	customerId: string;
	anchorMs?: number;
	periodEndMs: number;
}) => {
	const subscription = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: "active",
	});
	expect({
		billingCycleAnchor:
			anchorMs === undefined ? undefined : subscription.billing_cycle_anchor,
		currentPeriodEnd: subscription.items.data[0]?.current_period_end,
	}).toEqual({
		billingCycleAnchor:
			anchorMs === undefined ? undefined : msToSeconds(anchorMs),
		currentPeriodEnd: msToSeconds(periodEndMs),
	});
};

/** Moves the test clock past a cycle start far enough for Stripe to finalize the invoice raised on it. */
export const advancePastCycleStart = async ({
	ctx,
	testClockId,
	cycleStartsAt,
}: {
	ctx: TestContext;
	testClockId: string;
	cycleStartsAt: number;
}) =>
	advanceTestClock({
		stripeCli: ctx.stripeCli,
		testClockId,
		advanceTo: addHours(cycleStartsAt, hoursToFinalizeInvoice).getTime(),
	});

/**
 * Stripe's invoice for an anchor reset with proration: the full new cycle less the unused
 * time of the running period, prorated over that period's own length.
 */
export const calculateStripeAnchorResetTotal = async ({
	customerId,
	anchorMs,
	amount,
}: {
	customerId: string;
	anchorMs: number;
	amount: number;
}) => {
	const { billingPeriod } = await getBillingPeriod({ customerId });
	const unusedCredit = new Decimal(amount)
		.mul(billingPeriod.end - msToSeconds(anchorMs) * 1000)
		.div(billingPeriod.end - billingPeriod.start)
		.toDecimalPlaces(2);
	return new Decimal(amount).minus(unusedCredit).toNumber();
};
