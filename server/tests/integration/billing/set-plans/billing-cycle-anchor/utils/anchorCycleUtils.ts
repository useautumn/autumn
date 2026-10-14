import { expect } from "bun:test";
import { msToSeconds, stripeRefToId, stripeToAtmnAmount } from "@autumn/shared";
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
	const scheduleId = stripeRefToId(subscription.schedule);
	if (!scheduleId) throw new Error(`${customerId} has no Stripe schedule`);
	const upcomingInvoice = await ctx.stripeCli.invoices.createPreview({
		customer: subscription.customer as string,
		schedule: scheduleId,
	});
	expect(nextCycleTotal).toBe(
		stripeToAtmnAmount({ amount: upcomingInvoice.total, currency: "usd" }),
	);
};

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
