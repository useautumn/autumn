import { expect } from "bun:test";
import {
	addInterval,
	BillingInterval,
	CusProductStatus,
	type FullCusProduct,
	ms,
	msToSeconds,
	type ProductV2,
	secondsToMs,
} from "@autumn/shared";
import { findStripeSubscriptionByStatus } from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import { TestFeature } from "@tests/setup/v2Features";
import { timeout } from "@tests/utils/genUtils";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { Decimal } from "decimal.js";
import type Stripe from "stripe";
import {
	findLiveCustomerProduct,
	findStripeCustomerId,
	startsAtProducts,
} from "../../utils/futureStartUtils";

const CENTS_PER_UNIT = 100;
const WEBHOOK_SETTLE_WINDOW_MS = ms.seconds(15);
const WEBHOOK_SETTLE_POLL_MS = ms.seconds(1);

type ScenarioActions = Parameters<typeof initScenario>[0]["actions"];

/** A customer with pro on a live subscription, attached per entity when it has entities, then aged by advanceDays. */
export const initLiveProScenario = async ({
	customerId,
	entityCount = 0,
	advanceDays,
	otherProducts = [],
	afterAttach,
}: {
	customerId: string;
	entityCount?: number;
	advanceDays?: number;
	otherProducts?: ProductV2[];
	afterAttach?: (pro: ProductV2) => ScenarioActions;
}) => {
	const { pro } = startsAtProducts();
	const afterAttachSteps = afterAttach?.(pro) ?? [];
	const attachSteps =
		entityCount > 0
			? Array.from({ length: entityCount }, (_, entityIndex) =>
					s.billing.attach({ productId: pro.id, entityIndex }),
				)
			: [s.billing.attach({ productId: pro.id })];
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, ...otherProducts] }),
			...(entityCount > 0
				? [s.entities({ count: entityCount, featureId: TestFeature.Users })]
				: []),
		],
		actions: [
			...attachSteps,
			...afterAttachSteps,
			...(advanceDays ? [s.advanceTestClock({ days: advanceDays })] : []),
		],
	});
	return { ...scenario, pro };
};

/** The live subscription a backdate recreates, with the dates its paid period runs between. */
export const liveSubscriptionPeriod = async ({
	ctx,
	customerId,
	status = "active",
}: {
	ctx: TestContext;
	customerId: string;
	status?: Stripe.Subscription.Status;
}) => {
	const subscription = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status,
	});
	const [item] = subscription.items.data;
	if (!item) throw new Error("Live subscription has no items");

	const { data: invoices } = await ctx.stripeCli.invoices.list({
		subscription: subscription.id,
	});
	return {
		subscription,
		startMs: secondsToMs(subscription.start_date),
		periodStartMs: secondsToMs(item.current_period_start),
		periodEndMs: secondsToMs(item.current_period_end),
		invoiceCount: invoices.length,
		billedTotal: invoices
			.reduce((sum, invoice) => sum.plus(invoice.total), new Decimal(0))
			.div(CENTS_PER_UNIT)
			.toNumber(),
	};
};

const customerInvoiceLines = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const { data: invoices } = await ctx.stripeCli.invoices.list({
		customer: await findStripeCustomerId({ ctx, customerId }),
		limit: 100,
	});
	const billed = invoices.filter(({ status }) => status !== "void");
	const lines = await Promise.all(
		billed.map(async (invoice) => {
			const { data } = await ctx.stripeCli.invoices.listLineItems(invoice.id!, {
				limit: 100,
			});
			return data;
		}),
	);
	return lines.flat();
};

const lineFallsIn = ({
	line,
	startSeconds,
	endSeconds,
}: {
	line: Stripe.InvoiceLineItem;
	startSeconds: number;
	endSeconds: number;
}) => {
	const { start, end } = line.period;
	if (start === end) return start >= startSeconds && start < endSeconds;
	return start < endSeconds && end > startSeconds;
};

export type BilledPeriod = { startMs: number; endMs: number; total: number };

export type BackdateProrationBehavior =
	| "none"
	| "prorate_immediately"
	| "bill_difference";

/**
 * What a backdate bills for the cycles before the live start that it reaches: nothing for none,
 * each in full for bill_difference, otherwise pro rata for the time it covers.
 */
export const expectedBackdateGapCharge = ({
	cyclePrice,
	interval = BillingInterval.Month,
	backdatedStartMs,
	liveStartMs,
	prorationBehavior,
}: {
	cyclePrice: number;
	interval?: BillingInterval;
	backdatedStartMs: number;
	liveStartMs: number;
	prorationBehavior: BackdateProrationBehavior;
}) => {
	if (prorationBehavior === "none") return 0;

	let cycles = 1;
	while (
		addInterval({ from: liveStartMs, interval, intervalCount: -cycles }) >
		backdatedStartMs
	) {
		cycles += 1;
	}
	const wholeCycles = new Decimal(cyclePrice).mul(cycles);
	if (prorationBehavior === "bill_difference") return wholeCycles.toNumber();

	const cyclesStartMs = addInterval({
		from: liveStartMs,
		interval,
		intervalCount: -cycles,
	});
	return wholeCycles
		.mul(liveStartMs - backdatedStartMs)
		.div(liveStartMs - cyclesStartMs)
		.toDP(2)
		.toNumber();
};

/** The proration of a monthly price over the rest of a cycle from now. */
export const expectedRestOfCycle = ({
	monthlyPrice,
	nowMs,
	cycleStartMs,
	cycleEndMs,
}: {
	monthlyPrice: number;
	nowMs: number;
	cycleStartMs: number;
	cycleEndMs: number;
}) =>
	new Decimal(monthlyPrice)
		.mul(cycleEndMs - nowMs)
		.div(cycleEndMs - cycleStartMs)
		.toNumber();

/**
 * Across every invoice the customer has, on the replaced and the recreated subscription alike,
 * each service period is invoiced exactly its expected total: never twice, never skipped.
 */
export const expectEachPeriodBilledOnce = async ({
	ctx,
	customerId,
	periods,
}: {
	ctx: TestContext;
	customerId: string;
	periods: BilledPeriod[];
}) => {
	const lines = await customerInvoiceLines({ ctx, customerId });
	const billedTotals = periods.map(({ startMs, endMs }) =>
		lines
			.filter((line) =>
				lineFallsIn({
					line,
					startSeconds: msToSeconds(startMs),
					endSeconds: msToSeconds(endMs),
				}),
			)
			.reduce((sum, line) => sum.plus(line.amount), new Decimal(0))
			.div(CENTS_PER_UNIT)
			.toNumber(),
	);
	expect(billedTotals).toEqual(periods.map(({ total }) => total));
};

/** The replaced subscription ended with no final invoice, so nothing it already billed is billed again. */
export const expectReplacedSubscriptionCancelledQuietly = async ({
	ctx,
	subscriptionId,
	invoiceCountBefore,
}: {
	ctx: TestContext;
	subscriptionId: string;
	invoiceCountBefore: number;
}) => {
	const replaced = await ctx.stripeCli.subscriptions.retrieve(subscriptionId);
	expect(replaced.status).toBe("canceled");
	const { data: invoices } = await ctx.stripeCli.invoices.list({
		subscription: subscriptionId,
	});
	expect(invoices).toHaveLength(invoiceCountBefore);
};

/**
 * The recreated subscription starts on the backdated date and renews on the old period end for the
 * full price; given cancelAtMs it keeps the replaced subscription's cancel date instead of renewing.
 */
export const expectRecreatedSubscriptionCorrect = async ({
	ctx,
	customerId,
	replacedSubscriptionId,
	startMs,
	periodEndMs,
	renewalTotal,
	cancelAtMs,
}: {
	ctx: TestContext;
	customerId: string;
	replacedSubscriptionId: string;
	startMs: number;
	periodEndMs: number;
	renewalTotal?: number;
	cancelAtMs?: number;
}) => {
	const subscription = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: "active",
	});
	expect(subscription.id).not.toBe(replacedSubscriptionId);
	expect(subscription.start_date).toBe(msToSeconds(startMs));
	expect(subscription.billing_cycle_anchor).toBe(msToSeconds(periodEndMs));
	expect(subscription.cancel_at).toBe(
		cancelAtMs === undefined ? null : msToSeconds(cancelAtMs),
	);
	if (renewalTotal === undefined) return subscription;

	const upcoming = await ctx.stripeCli.invoices.createPreview({
		subscription: subscription.id,
	});
	expect(upcoming.lines.data.map(({ period }) => period.start)).toContainEqual(
		msToSeconds(periodEndMs),
	);
	expect(new Decimal(upcoming.total).div(CENTS_PER_UNIT).toNumber()).toBe(
		renewalTotal,
	);
	return subscription;
};

/** The replaced subscription's webhooks land after set_plans returns, so a row must hold its state across them, not just once. */
export const expectCustomerProductHoldsAcrossWebhooks = async ({
	ctx,
	customerId,
	productId,
	assert,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
	assert: (customerProduct: FullCusProduct) => void;
}) => {
	const settledAt = Date.now() + WEBHOOK_SETTLE_WINDOW_MS;
	while (Date.now() < settledAt) {
		assert(await findLiveCustomerProduct({ ctx, customerId, productId }));
		await timeout(WEBHOOK_SETTLE_POLL_MS);
	}
	const customerProduct = await findLiveCustomerProduct({
		ctx,
		customerId,
		productId,
	});
	assert(customerProduct);
	return customerProduct;
};

/** The scheduled plan rides the recreated subscription's new schedule, whose phase on its start date bills it. */
export const expectScheduledOnRecreatedSchedule = async ({
	ctx,
	customerId,
	productId,
	subscriptionId,
	scheduleId,
	startsAt,
}: {
	ctx: TestContext;
	customerId: string;
	productId: string;
	subscriptionId: string;
	scheduleId: string;
	startsAt: number;
}) => {
	const scheduled = await findLiveCustomerProduct({
		ctx,
		customerId,
		productId,
	});
	expect(scheduled.status).toBe(CusProductStatus.Scheduled);
	expect(scheduled.starts_at).toBe(startsAt);
	expect(scheduled.scheduled_ids).toEqual([scheduleId]);

	const schedule =
		await ctx.stripeCli.subscriptionSchedules.retrieve(scheduleId);
	expect(schedule.subscription).toBe(subscriptionId);
	const phase = schedule.phases.find(
		({ start_date }) => start_date === msToSeconds(startsAt),
	);
	const phasePriceIds = (phase?.items ?? []).map(({ price }) =>
		typeof price === "string" ? price : price.id,
	);
	const planPriceIds = scheduled.customer_prices.flatMap(({ price }) =>
		price.config.stripe_price_id ? [price.config.stripe_price_id] : [],
	);
	expect(planPriceIds).not.toBeEmpty();
	expect(phasePriceIds).toEqual(expect.arrayContaining(planPriceIds));
};
