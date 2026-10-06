import { expect } from "bun:test";
import {
	BillingInterval,
	getCycleEnd,
	getCycleStart,
	msToSeconds,
	type SetPlansParamsV0Input,
} from "@autumn/shared";
import { findStripeSubscriptionByStatus } from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { calculateProrationFromPeriod } from "@tests/integration/billing/utils/proration";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { Decimal } from "decimal.js";
import type { BackdateProrationBehavior } from "../../backdate-live/utils/backdateLiveUtils";
import { startsAtProducts, testClockNowMs } from "../../utils/futureStartUtils";

export const PRO_MONTHLY_PRICE = 20;

/** A customer with a card and no subscription, plus the test clock's now. */
export const initNewCustomerScenario = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const { pro } = startsAtProducts();
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [],
	});
	const nowMs = await testClockNowMs({
		ctx: scenario.ctx,
		testClockId: scenario.testClockId!,
	});
	return { ...scenario, pro, nowMs };
};

export const backdateParams = ({
	customerId,
	planId,
	startsAt,
	prorationBehavior,
	billingCycleAnchor,
	featureQuantities,
}: {
	customerId: string;
	planId: string;
	startsAt: number;
	prorationBehavior: BackdateProrationBehavior;
	billingCycleAnchor?: number;
	featureQuantities?: { feature_id: string; quantity: number }[];
}): SetPlansParamsV0Input => ({
	customer_id: customerId,
	phases: [
		{
			proration_behavior: prorationBehavior,
			starts_at: startsAt,
			plans: [
				{
					plan_id: planId,
					...(featureQuantities && { feature_quantities: featureQuantities }),
				},
			],
			...(billingCycleAnchor !== undefined && {
				billing_cycle_anchor: billingCycleAnchor,
			}),
		},
	],
});

/**
 * What Stripe bills when it creates a monthly subscription backdated to startMs: nothing with
 * proration none, otherwise a stub prorated up to the anchor's first boundary plus every cycle
 * starting at or before now in full, including the one running now.
 */
export const expectedNewBackdateCharge = ({
	startMs,
	nowMs,
	anchorMs,
	prorationBehavior,
}: {
	startMs: number;
	nowMs: number;
	anchorMs?: number;
	prorationBehavior: BackdateProrationBehavior;
}) => {
	if (prorationBehavior === "none") return 0;

	const anchor = anchorMs ?? startMs;
	const interval = BillingInterval.Month;
	const firstCycleStart = getCycleStart({ anchor, interval, now: startMs });
	const firstCycleEnd = getCycleEnd({ anchor, interval, now: startMs });
	const stub =
		firstCycleStart === startMs
			? PRO_MONTHLY_PRICE
			: calculateProrationFromPeriod({
					billingPeriod: { start: firstCycleStart, end: firstCycleEnd },
					advancedTo: startMs,
					amount: PRO_MONTHLY_PRICE,
				});

	let total = new Decimal(stub);
	for (
		let cycleStart = firstCycleEnd;
		cycleStart <= nowMs;
		cycleStart = getCycleEnd({ anchor, interval, now: cycleStart })
	) {
		total = total.plus(PRO_MONTHLY_PRICE);
	}
	return total.toDecimalPlaces(2).toNumber();
};

const toDollars = (cents: number) => new Decimal(cents).div(100).toNumber();

/** Preview, Stripe's invoices and Stripe's subscription period all match what Stripe bills for the backdate, then Autumn records the same invoices. */
export const expectNewBackdateBilledCorrect = async ({
	ctx,
	autumnV1,
	customerId,
	startMs,
	nowMs,
	anchorMs,
	previewTotal,
	expectedCharge,
}: {
	ctx: TestContext;
	autumnV1: Parameters<typeof expectCustomerInvoiceCorrect>[0]["autumn"];
	customerId: string;
	startMs: number;
	nowMs: number;
	anchorMs?: number;
	previewTotal: number;
	expectedCharge: number;
}) => {
	const subscription = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: "active",
	});
	const { data: invoices } = await ctx.stripeCli.invoices.list({
		subscription: subscription.id,
	});
	const [item] = subscription.items.data;
	const expectedInvoiceTotals = expectedCharge === 0 ? [] : [expectedCharge];

	expect({
		previewTotal: new Decimal(previewTotal).toDecimalPlaces(2).toNumber(),
		stripeInvoiceTotals: invoices.map(({ total }) => toDollars(total)),
		startDate: subscription.start_date,
		currentPeriodEnd: item?.current_period_end,
	}).toEqual({
		previewTotal: expectedCharge,
		stripeInvoiceTotals: expectedInvoiceTotals,
		startDate: msToSeconds(startMs),
		currentPeriodEnd: msToSeconds(
			getCycleEnd({
				anchor: anchorMs ?? startMs,
				interval: BillingInterval.Month,
				now: nowMs,
			}),
		),
	});

	await expectCustomerInvoiceCorrect({
		customerId,
		autumn: autumnV1,
		count: expectedInvoiceTotals.length,
		latestTotal: expectedInvoiceTotals[0],
	});
};

/** The total Stripe will invoice at the subscription's next renewal, including any pending invoice items. */
export const expectRenewalInvoiceTotal = async ({
	ctx,
	customerId,
	total,
}: {
	ctx: TestContext;
	customerId: string;
	total: number;
}) => {
	const subscription = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: "active",
	});
	const renewal = await ctx.stripeCli.invoices.createPreview({
		subscription: subscription.id,
	});
	expect(toDollars(renewal.total)).toBe(total);
};
