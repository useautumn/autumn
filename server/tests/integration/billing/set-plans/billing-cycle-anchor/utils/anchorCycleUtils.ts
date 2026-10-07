import { expect } from "bun:test";
import {
	msToSeconds,
	type SetPlansParamsV0Input,
	stripeToAtmnAmount,
} from "@autumn/shared";
import {
	calculateProration,
	calculateProrationFromPeriod,
} from "@tests/integration/billing/utils/proration";
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

/** Stripe's switch proration: the new plan's charge and the old plan's credit, each rounded to cents. */
export const calculateStripeProratedSwitch = async ({
	customerId,
	advancedTo,
	oldAmount,
	newAmount,
}: {
	customerId: string;
	advancedTo: number;
	oldAmount: number;
	newAmount: number;
}) => {
	const [charge, credit] = await Promise.all(
		[newAmount, oldAmount].map((amount) =>
			calculateProration({ customerId, advancedTo, amount }),
		),
	);
	return new Decimal(charge).minus(credit).toNumber();
};

/** The live subscription item billed on this interval, on a subscription that mixes intervals. */
const findStripeItemByInterval = async ({
	ctx,
	customerId,
	interval,
}: {
	ctx: TestContext;
	customerId: string;
	interval: "month" | "year";
}) => {
	const subscription = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: "active",
	});
	const item = subscription.items.data.find(
		({ price }) => price.recurring?.interval === interval,
	);
	if (!item) throw new Error(`No ${interval}ly item on ${subscription.id}`);
	return item;
};

/** One item's reset-now total: the full new amount less the old amount's unused time on that item's own period. */
export const calculateItemResetNowTotal = async ({
	ctx,
	customerId,
	advancedTo,
	interval,
	oldAmount,
	newAmount,
}: {
	ctx: TestContext;
	customerId: string;
	advancedTo: number;
	interval: "month" | "year";
	oldAmount: number;
	newAmount: number;
}) => {
	const item = await findStripeItemByInterval({ ctx, customerId, interval });
	const unusedCredit = calculateProrationFromPeriod({
		billingPeriod: {
			start: item.current_period_start * 1000,
			end: item.current_period_end * 1000,
		},
		advancedTo,
		amount: oldAmount,
	});
	return new Decimal(newAmount)
		.minus(unusedCredit)
		.toDecimalPlaces(2)
		.toNumber();
};

export const expectStripeItemPeriodEnd = async ({
	ctx,
	customerId,
	interval,
	periodEndMs,
}: {
	ctx: TestContext;
	customerId: string;
	interval: "month" | "year";
	periodEndMs: number;
}) => {
	const item = await findStripeItemByInterval({ ctx, customerId, interval });
	expect(item.current_period_end).toBe(msToSeconds(periodEndMs));
};

/** A phase that starts now and resets the billing cycle there. */
export const resetNowPhase = ({
	planIds,
	prorationBehavior,
}: {
	planIds: string[];
	prorationBehavior?: "none" | "bill_difference";
}): SetPlansParamsV0Input["phases"][number] => ({
	starts_at: "now",
	billing_cycle_anchor: "phase_start",
	...(prorationBehavior && { proration_behavior: prorationBehavior }),
	plans: planIds.map((planId) => ({ plan_id: planId })),
});
