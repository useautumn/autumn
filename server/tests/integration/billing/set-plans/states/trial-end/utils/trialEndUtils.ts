import { expect } from "bun:test";
import {
	type ApiCustomerV5,
	type BillingBehavior,
	ms,
	msToSeconds,
	type SetPlansParamsV0Input,
	secondsToMs,
} from "@autumn/shared";
import { advancePastCycleStart } from "@tests/integration/billing/set-plans/billing-cycle-anchor/utils/anchorCycleUtils";
import { expectPlanKept } from "@tests/integration/billing/set-plans/utils/resyncUtils";
import {
	expectLiveSubscriptionCharged,
	expectPreviewWarning,
	expectStripeUpcomingInvoiceCorrect,
	expectSubscriptionInvoiceTotals,
	findStripeSubscriptionByStatus,
} from "@tests/integration/billing/set-plans/utils/subscriptionStateUtils";
import { expectSubscriptionNotTrialing } from "@tests/integration/billing/utils/expect-customer-products/expectSubscriptionTrialing";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { calculateNewSubscriptionAnchorStub } from "@tests/integration/billing/utils/proration";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import { addMonths } from "date-fns";
import { Decimal } from "decimal.js";
import { CusService } from "@/internal/customers/CusService";

const PRO_PRICE = 540;
const ADD_ON_PRICE = 400;
const MONTHLY_TOTAL = PRO_PRICE + ADD_ON_PRICE;
const INCLUDED_MESSAGES = 1000;
const TRACKED_MESSAGES = 200;
const TRIAL_DAYS = 14;
const ANCHOR_DAYS = 8;
// The trial's own $0 invoices: Pro starting it, then the add-on joining it.
const TRIAL_INVOICE_TOTALS = [0, 0];

/** Pro and an add-on trialing on one subscription, with usage, ended now and anchored 8 days out. */
const setupTrialingPlans = async ({ customerId }: { customerId: string }) => {
	const pro = products.base({
		id: "pro540",
		items: [
			items.monthlyPrice({ price: PRO_PRICE }),
			items.monthlyMessages({ includedUsage: INCLUDED_MESSAGES }),
		],
		trialDays: TRIAL_DAYS,
	});
	const addOn = products.base({
		id: "credits400",
		isAddOn: true,
		items: [items.monthlyPrice({ price: ADD_ON_PRICE })],
	});
	const { autumnV2_4, ctx, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addOn] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.billing.attach({ productId: addOn.id }),
			s.track({
				featureId: TestFeature.Messages,
				value: TRACKED_MESSAGES,
				timeout: 2000,
			}),
		],
	});
	const trialing = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: "trialing",
	});
	const { customer_products: customerProducts } = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const findCustomerProductId = (productId: string) =>
		customerProducts.find(({ product }) => product.id === productId)!.id;
	return {
		pro,
		addOn,
		autumnV2_4,
		ctx,
		testClockId: testClockId!,
		trialing,
		anchorMs: advancedTo + ms.days(ANCHOR_DAYS),
		advancedTo,
		keptIds: {
			pro: findCustomerProductId(pro.id),
			addOn: findCustomerProductId(addOn.id),
		},
	};
};

const carryOverMessages = ({ carriesUsage }: { carriesUsage: boolean }) =>
	carriesUsage
		? {
				carry_over_usages: {
					enabled: true,
					feature_ids: [TestFeature.Messages],
				},
			}
		: {};

/** Ending the trial refills the balance now, unless carry_over_usages keeps the trial's usage. */
const trialEndBalance = ({ carriesUsage }: { carriesUsage: boolean }) => {
	const usage = carriesUsage ? TRACKED_MESSAGES : 0;
	return { remaining: INCLUDED_MESSAGES - usage, usage };
};

/** Stripe prorates and rounds each item's stub separately. */
export const proratedStub = ({
	advancedTo,
	anchorMs,
}: {
	advancedTo: number;
	anchorMs: number;
}) =>
	[PRO_PRICE, ADD_ON_PRICE]
		.reduce(
			(total, amount) =>
				total.plus(
					calculateNewSubscriptionAnchorStub({ advancedTo, anchorMs, amount }),
				),
			new Decimal(0),
		)
		.toNumber();

/** Without a requested anchor the cycle starts on the old trial end. */
export const endTrialOnAnchorAndExpect = async ({
	customerId,
	anchorSource,
	prorationBehavior,
	expectedStub,
	carriesUsage = false,
}: {
	customerId: string;
	anchorSource: "requested" | "trial_end";
	prorationBehavior?: BillingBehavior;
	expectedStub: (args: { advancedTo: number; anchorMs: number }) => number;
	carriesUsage?: boolean;
}) => {
	const {
		pro,
		addOn,
		autumnV2_4,
		ctx,
		testClockId,
		trialing,
		anchorMs: requestedAnchorMs,
		keptIds,
	} = await setupTrialingPlans({ customerId });
	const requestsAnchor = anchorSource === "requested";
	const anchorMs = requestsAnchor
		? requestedAnchorMs
		: secondsToMs(trialing.trial_end!);
	const params: SetPlansParamsV0Input = {
		customer_id: customerId,
		free_trial: null,
		...carryOverMessages({ carriesUsage }),
		phases: [
			{
				starts_at: "now",
				...(requestsAnchor && { billing_cycle_anchor: anchorMs }),
				...(prorationBehavior && { proration_behavior: prorationBehavior }),
				plans: [{ plan_id: pro.id }, { plan_id: addOn.id }],
			},
		],
	};

	const preview = await autumnV2_4.billing.previewSetPlans(params);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: anchorMs,
		total: MONTHLY_TOTAL,
		toleranceMs: 1000,
	});
	expectPreviewWarning({
		preview,
		type: "subscription_replaced",
		messageContains: [trialing.id],
	});

	await autumnV2_4.billing.setPlans(params);

	expect((await ctx.stripeCli.subscriptions.retrieve(trialing.id)).status).toBe(
		"canceled",
	);
	const newSubscription = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: "active",
	});
	// The stub runs from the instant Stripe created the subscription, which the preview shares.
	const stubTotal = expectedStub({
		advancedTo: secondsToMs(newSubscription.start_date),
		anchorMs,
	});
	expect(preview.total).toBe(stubTotal);
	expect({
		status: newSubscription.status,
		trialEnd: newSubscription.trial_end,
		billingCycleAnchor: newSubscription.billing_cycle_anchor,
	}).toEqual({
		status: "active",
		trialEnd: null,
		billingCycleAnchor: msToSeconds(anchorMs),
	});
	await expectLiveSubscriptionCharged({ ctx, customerId, total: stubTotal });

	for (const [productId, customerProductId] of [
		[pro.id, keptIds.pro],
		[addOn.id, keptIds.addOn],
	] as const) {
		await expectPlanKept({
			ctx,
			customerId,
			productId,
			customerProductId,
			subscriptionId: newSubscription.id,
		});
	}
	const customer = await autumnV2_4.customers.get<ApiCustomerV5>(customerId);
	for (const productId of [pro.id, addOn.id]) {
		await expectSubscriptionNotTrialing({ customer, productId });
	}
	await expectBalanceCorrect({
		customerId,
		featureId: TestFeature.Messages,
		...trialEndBalance({ carriesUsage }),
	});

	// The anchor bills one full renewal, with no separate cycle reset on top, and resets usage.
	await advancePastCycleStart({ ctx, testClockId, cycleStartsAt: anchorMs });
	await expectBalanceCorrect({
		customerId,
		featureId: TestFeature.Messages,
		remaining: INCLUDED_MESSAGES,
		usage: 0,
	});
	await expectSubscriptionInvoiceTotals({
		ctx,
		subscriptionId: newSubscription.id,
		totals: [...(stubTotal > 0 ? [stubTotal] : []), MONTHLY_TOTAL],
	});
};

/** Ending the trial with a reset now keeps the subscription, restarts the plans' cycle and bills one full period now. */
export const endTrialResettingNowAndExpect = async ({
	customerId,
	prorationBehavior,
	carriesUsage = false,
}: {
	customerId: string;
	prorationBehavior?: BillingBehavior;
	carriesUsage?: boolean;
}) => {
	const { pro, addOn, autumnV2_4, ctx, testClockId, trialing, advancedTo } =
		await setupTrialingPlans({ customerId });
	const params: SetPlansParamsV0Input = {
		customer_id: customerId,
		free_trial: null,
		...carryOverMessages({ carriesUsage }),
		phases: [
			{
				starts_at: "now",
				billing_cycle_anchor: "phase_start",
				...(prorationBehavior && { proration_behavior: prorationBehavior }),
				plans: [{ plan_id: pro.id }, { plan_id: addOn.id }],
			},
		],
	};
	const preview = await autumnV2_4.billing.previewSetPlans(params);
	expect(preview.total).toBe(MONTHLY_TOTAL);
	expectPreviewWarning({ preview, type: "trial_ended" });
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: addMonths(advancedTo, 1).getTime(),
		total: MONTHLY_TOTAL,
		toleranceMs: ms.minutes(1),
	});

	await autumnV2_4.billing.setPlans(params);

	// Stripe's trial_end now anchors the cycle on the instant the trial ended.
	const ended = await ctx.stripeCli.subscriptions.retrieve(trialing.id);
	expect({ status: ended.status, trialEnd: ended.trial_end }).toEqual({
		status: "active",
		trialEnd: ended.billing_cycle_anchor,
	});
	const renewalAt = addMonths(
		secondsToMs(ended.billing_cycle_anchor),
		1,
	).getTime();
	await expectStripeUpcomingInvoiceCorrect({
		ctx,
		subscriptionId: trialing.id,
		startsAt: renewalAt,
		total: MONTHLY_TOTAL,
	});
	// Like any reset now, the plans restart their cycle: usage resets unless carry_over_usages carries it.
	await expectCustomerProducts({ customerId, active: [pro.id, addOn.id] });
	await expectBalanceCorrect({
		customerId,
		featureId: TestFeature.Messages,
		...trialEndBalance({ carriesUsage }),
		nextResetAt: renewalAt,
	});
	const customer = await autumnV2_4.customers.get<ApiCustomerV5>(customerId);
	for (const productId of [pro.id, addOn.id]) {
		await expectSubscriptionNotTrialing({ customer, productId });
	}
	await expectSubscriptionInvoiceTotals({
		ctx,
		subscriptionId: trialing.id,
		totals: [...TRIAL_INVOICE_TOTALS, MONTHLY_TOTAL],
	});

	// Nothing more at the old trial end; the next full period on the renewal.
	await advancePastCycleStart({
		ctx,
		testClockId,
		cycleStartsAt: advancedTo + ms.days(TRIAL_DAYS),
	});
	await expectSubscriptionInvoiceTotals({
		ctx,
		subscriptionId: trialing.id,
		totals: [...TRIAL_INVOICE_TOTALS, MONTHLY_TOTAL],
	});
	await advancePastCycleStart({ ctx, testClockId, cycleStartsAt: renewalAt });
	await expectSubscriptionInvoiceTotals({
		ctx,
		subscriptionId: trialing.id,
		totals: [...TRIAL_INVOICE_TOTALS, MONTHLY_TOTAL, MONTHLY_TOTAL],
	});
};
