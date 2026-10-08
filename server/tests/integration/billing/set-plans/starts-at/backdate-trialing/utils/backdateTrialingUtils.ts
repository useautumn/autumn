import { expect } from "bun:test";
import {
	type ApiCustomerV5,
	BillingInterval,
	getCycleEnd,
	getCycleStart,
	msToSeconds,
	type SetPlansParamsV0Input,
	secondsToMs,
} from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import { advancePastCycleStart } from "@tests/integration/billing/set-plans/billing-cycle-anchor/utils/anchorCycleUtils";
import {
	expectPlanKept,
	expectPlanStartsAt,
} from "@tests/integration/billing/set-plans/utils/resyncUtils";
import {
	expectPreviewWarning,
	expectSubscriptionInvoiceTotals,
	findStripeSubscriptionByStatus,
} from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import {
	expectSubscriptionNotTrialing,
	expectSubscriptionTrialing,
} from "@tests/integration/billing/utils/expect-customer-products/expectSubscriptionTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { calculateProrationFromPeriod } from "@tests/integration/billing/utils/proration";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { addDays, subMonths } from "date-fns";
import type { BackdateProrationBehavior } from "../../backdate-live/utils/backdateLiveUtils";
import {
	expectedNewBackdateCharge,
	PRO_MONTHLY_PRICE,
} from "../../backdate-new/utils/backdateNewUtils";
import {
	findLiveCustomerProduct,
	testClockNowMs,
} from "../../utils/futureStartUtils";

const INCLUDED_MESSAGES = 100;
const TRACKED_MESSAGES = 30;
const TRIAL_DAYS = 14;
// A trial-off custom anchor lands after the old trial end; a kept trial's lands after the trial end, inside its month.
const TRIAL_OFF_ANCHOR_DAYS = 20;
const TRIAL_KEPT_ANCHOR_DAYS_AFTER_TRIAL = 6;

export type BackdateTrialAnchor = "unset" | "custom" | "phase_start";

/** Pro trialing for 14 days on a live Stripe subscription, with usage tracked during the trial. */
const initTrialingProScenario = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const proTrial = products.proWithTrial({
		items: [items.monthlyMessages({ includedUsage: INCLUDED_MESSAGES })],
		trialDays: TRIAL_DAYS,
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.billing.attach({ productId: proTrial.id }),
			s.track({
				featureId: TestFeature.Messages,
				value: TRACKED_MESSAGES,
				timeout: 2000,
			}),
		],
	});
	const { ctx, testClockId } = scenario;
	const trialing = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: "trialing",
	});
	const { data: trialInvoices } = await ctx.stripeCli.invoices.list({
		subscription: trialing.id,
	});
	const customerProduct = await findLiveCustomerProduct({
		ctx,
		customerId,
		productId: proTrial.id,
	});
	return {
		...scenario,
		proTrial,
		trialing,
		trialEndMs: secondsToMs(trialing.trial_end!),
		trialInvoiceCount: trialInvoices.length,
		customerProductId: customerProduct.id,
		nowMs: await testClockNowMs({ ctx, testClockId: testClockId! }),
	};
};

/** The custom anchor a request names, or undefined for no anchor and phase_start. */
const customAnchorMs = ({
	anchor,
	keepsTrial,
	nowMs,
	trialEndMs,
}: {
	anchor: BackdateTrialAnchor;
	keepsTrial: boolean;
	nowMs: number;
	trialEndMs: number;
}) => {
	if (anchor !== "custom") return undefined;
	return keepsTrial
		? addDays(trialEndMs, TRIAL_KEPT_ANCHOR_DAYS_AFTER_TRIAL).getTime()
		: addDays(nowMs, TRIAL_OFF_ANCHOR_DAYS).getTime();
};

/**
 * What Stripe does for each case (handoffs/ATMN-812 probe). Trial off: the recreated sub anchors on the requested
 * anchor, else the old trial end, else (phase_start) the backdated start, and bills the backdated window as
 * create_prorations unless proration is none. Trial kept: the trial stretches back, so nothing is billed until
 * the trial end, then a stub up to a later anchor if one was requested.
 */
const expectedBilling = ({
	keepsTrial,
	anchor,
	prorationBehavior,
	startMs,
	nowMs,
	trialEndMs,
	requestedAnchorMs,
}: {
	keepsTrial: boolean;
	anchor: BackdateTrialAnchor;
	prorationBehavior: BackdateProrationBehavior;
	startMs: number;
	nowMs: number;
	trialEndMs: number;
	requestedAnchorMs?: number;
}) => {
	if (keepsTrial) {
		const trialEndRenewal = { atMs: trialEndMs, total: PRO_MONTHLY_PRICE };
		const renewals =
			requestedAnchorMs === undefined
				? [trialEndRenewal]
				: [
						{
							atMs: trialEndMs,
							total: calculateProrationFromPeriod({
								billingPeriod: {
									start: getCycleStart({
										anchor: requestedAnchorMs,
										interval: BillingInterval.Month,
										now: trialEndMs,
									}),
									end: requestedAnchorMs,
								},
								advancedTo: trialEndMs,
								amount: PRO_MONTHLY_PRICE,
							}),
						},
						{ atMs: requestedAnchorMs, total: PRO_MONTHLY_PRICE },
					];
		return {
			anchorMs: requestedAnchorMs ?? trialEndMs,
			chargeNow: 0,
			createInvoiceTotals: [0],
			renewals,
		};
	}

	const anchorsOnStart = anchor === "phase_start";
	const anchorMs = anchorsOnStart ? startMs : (requestedAnchorMs ?? trialEndMs);
	const chargeNow = expectedNewBackdateCharge({
		startMs,
		nowMs,
		anchorMs,
		prorationBehavior,
	});
	return {
		anchorMs,
		chargeNow,
		createInvoiceTotals: chargeNow > 0 ? [chargeNow] : [],
		renewals: [
			{
				atMs: anchorsOnStart
					? getCycleEnd({
							anchor: startMs,
							interval: BillingInterval.Month,
							now: nowMs,
						})
					: anchorMs,
				total: PRO_MONTHLY_PRICE,
			},
		],
	};
};

/**
 * Backdates the first phase of a trialing subscription two months and ten days, turning the trial off or keeping it,
 * then checks preview == execute == Stripe, the recreated subscription, the kept row and its balance, and that
 * each renewal past the anchor bills once.
 */
export const backdateTrialingAndExpect = async ({
	customerId,
	keepsTrial,
	anchor,
	prorationBehavior,
}: {
	customerId: string;
	keepsTrial: boolean;
	anchor: BackdateTrialAnchor;
	prorationBehavior: BackdateProrationBehavior;
}) => {
	const {
		autumnV2_4,
		ctx,
		testClockId,
		proTrial,
		trialing,
		trialEndMs,
		trialInvoiceCount,
		customerProductId,
		nowMs,
	} = await initTrialingProScenario({ customerId });
	const startMs = addDays(subMonths(new UTCDate(nowMs), 2), -10).getTime();
	const requestedAnchorMs = customAnchorMs({
		anchor,
		keepsTrial,
		nowMs,
		trialEndMs,
	});
	const expected = expectedBilling({
		keepsTrial,
		anchor,
		prorationBehavior,
		startMs,
		nowMs,
		trialEndMs,
		requestedAnchorMs,
	});
	const params: SetPlansParamsV0Input = {
		customer_id: customerId,
		...(!keepsTrial && { free_trial: null }),
		phases: [
			{
				starts_at: startMs,
				proration_behavior: prorationBehavior,
				...(requestedAnchorMs !== undefined && {
					billing_cycle_anchor: requestedAnchorMs,
				}),
				...(anchor === "phase_start" && {
					billing_cycle_anchor: "phase_start",
				}),
				plans: [{ plan_id: proTrial.id }],
			},
		],
	};

	const preview = await autumnV2_4.billing.previewSetPlans(params);
	expectPreviewWarning({
		preview,
		type: "subscription_replaced",
		messageContains: [trialing.id],
	});
	const [firstRenewal] = expected.renewals;
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: firstRenewal!.atMs,
		total: firstRenewal!.total,
		toleranceMs: 1000,
	});

	await autumnV2_4.billing.setPlans(params);

	const replaced = await ctx.stripeCli.subscriptions.retrieve(trialing.id);
	const { data: replacedInvoices } = await ctx.stripeCli.invoices.list({
		subscription: trialing.id,
	});
	const recreated = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: keepsTrial ? "trialing" : "active",
	});
	expect({
		previewTotal: preview.total,
		replacedStatus: replaced.status,
		replacedInvoiceCount: replacedInvoices.length,
		recreatedIsNew: recreated.id !== trialing.id,
		startDate: recreated.start_date,
		trialEnd: recreated.trial_end,
		billingCycleAnchor: recreated.billing_cycle_anchor,
	}).toEqual({
		previewTotal: expected.chargeNow,
		replacedStatus: "canceled",
		replacedInvoiceCount: trialInvoiceCount,
		recreatedIsNew: true,
		startDate: msToSeconds(startMs),
		trialEnd: keepsTrial ? msToSeconds(trialEndMs) : null,
		billingCycleAnchor: msToSeconds(expected.anchorMs),
	});
	await expectSubscriptionInvoiceTotals({
		ctx,
		subscriptionId: recreated.id,
		totals: expected.createInvoiceTotals,
	});

	await expectPlanKept({
		ctx,
		customerId,
		productId: proTrial.id,
		customerProductId,
		subscriptionId: recreated.id,
	});
	await expectPlanStartsAt({
		ctx,
		customerId,
		productId: proTrial.id,
		startsAt: startMs,
	});
	const customer = await autumnV2_4.customers.get<ApiCustomerV5>(customerId);
	if (keepsTrial) {
		await expectSubscriptionTrialing({
			customer,
			productId: proTrial.id,
			trialEndsAt: trialEndMs,
		});
	} else {
		await expectSubscriptionNotTrialing({ customer, productId: proTrial.id });
	}
	// Ending the trial is a carry point, so usage resets without carry_over_usages; a kept trial keeps it.
	const usage = keepsTrial ? TRACKED_MESSAGES : 0;
	await expectBalanceCorrect({
		customerId,
		featureId: TestFeature.Messages,
		remaining: INCLUDED_MESSAGES - usage,
		usage,
	});

	// Each renewal bills once: the full period, or a kept trial's stub up to a later anchor first.
	const billedTotals = [...expected.createInvoiceTotals];
	for (const renewal of expected.renewals) {
		await advancePastCycleStart({
			ctx,
			testClockId: testClockId!,
			cycleStartsAt: renewal.atMs,
		});
		billedTotals.push(renewal.total);
		await expectSubscriptionInvoiceTotals({
			ctx,
			subscriptionId: recreated.id,
			totals: billedTotals,
		});
	}
	await expectBalanceCorrect({
		customerId,
		featureId: TestFeature.Messages,
		remaining: INCLUDED_MESSAGES,
		usage: 0,
	});
};
