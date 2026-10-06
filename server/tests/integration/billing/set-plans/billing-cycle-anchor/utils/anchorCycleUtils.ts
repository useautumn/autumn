import { expect } from "bun:test";
import { msToSeconds, stripeToAtmnAmount } from "@autumn/shared";
import { hoursToFinalizeInvoice } from "@tests/utils/constants";
import { advanceTestClock } from "@tests/utils/stripeUtils";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { addHours } from "date-fns";
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

/** The previewed next_cycle total is what Stripe's own upcoming invoice for the schedule charges. */
export const expectNextCycleTotalMatchesStripe = async ({
	ctx,
	customerId,
	nextCycleTotal,
}: {
	ctx: TestContext;
	customerId: string;
	nextCycleTotal?: number;
}) => {
	const subscription = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: "active",
	});
	const scheduleId =
		typeof subscription.schedule === "string"
			? subscription.schedule
			: subscription.schedule?.id;
	if (!scheduleId) throw new Error(`${customerId} has no Stripe schedule`);
	const upcomingInvoice = await ctx.stripeCli.invoices.createPreview({
		customer: subscription.customer as string,
		schedule: scheduleId,
	});
	expect(nextCycleTotal).toBe(
		stripeToAtmnAmount({ amount: upcomingInvoice.total, currency: "usd" }),
	);
};
