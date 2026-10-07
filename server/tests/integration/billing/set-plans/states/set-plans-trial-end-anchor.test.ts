/**
 * Ending a live trial with a future billing_cycle_anchor recreates the subscription: Stripe's update can't anchor
 * on a date and always invoices when a trial ends. Like subscriptions.create with that anchor, none (the default)
 * bills nothing until it and prorate_immediately bills the stub now; bill_difference prorates like any new subscription.
 *
 * Red (before):  the trial ended in place, billing a full $940 now plus the anchor reset's prorated period.
 * Green (after): the trialing subscription is cancelled and a new one anchored on the date bills as previewed.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type BillingBehavior,
	ms,
	msToSeconds,
	type SetPlansParamsV0Input,
} from "@autumn/shared";
import { expectSubscriptionNotTrialing } from "@tests/integration/billing/utils/expect-customer-products/expectSubscriptionTrialing";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { calculateNewSubscriptionAnchorStub } from "@tests/integration/billing/utils/proration";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { CusService } from "@/internal/customers/CusService";
import { advancePastCycleStart } from "../billing-cycle-anchor/utils/anchorCycleUtils";
import { expectPlanKept } from "../utils/resyncUtils";
import {
	expectLiveSubscriptionCharged,
	expectPreviewWarning,
	expectSubscriptionInvoiceTotals,
	findStripeSubscriptionByStatus,
} from "../utils/subscriptionStateUtils";

const PRO_PRICE = 540;
const ADD_ON_PRICE = 400;
const MONTHLY_TOTAL = PRO_PRICE + ADD_ON_PRICE;
const INCLUDED_MESSAGES = 1000;
const TRACKED_MESSAGES = 200;
const TRIAL_DAYS = 14;
const ANCHOR_DAYS = 8;

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

/** Stripe prorates and rounds each item's stub separately. */
const proratedStub = ({
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

const endTrialOnAnchorAndExpect = async ({
	customerId,
	prorationBehavior,
	expectedStub,
}: {
	customerId: string;
	prorationBehavior?: BillingBehavior;
	expectedStub: (args: { advancedTo: number; anchorMs: number }) => number;
}) => {
	const {
		pro,
		addOn,
		autumnV2_4,
		ctx,
		testClockId,
		trialing,
		anchorMs,
		advancedTo,
		keptIds,
	} = await setupTrialingPlans({ customerId });
	const stubTotal = expectedStub({ advancedTo, anchorMs });
	const params: SetPlansParamsV0Input = {
		customer_id: customerId,
		free_trial: null,
		phases: [
			{
				starts_at: "now",
				billing_cycle_anchor: anchorMs,
				...(prorationBehavior && { proration_behavior: prorationBehavior }),
				plans: [{ plan_id: pro.id }, { plan_id: addOn.id }],
			},
		],
	};

	const preview = await autumnV2_4.billing.previewSetPlans(params);
	expect(preview.total).toBe(stubTotal);
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
		remaining: INCLUDED_MESSAGES - TRACKED_MESSAGES,
		usage: TRACKED_MESSAGES,
	});

	// The anchor bills one full renewal, with no separate cycle reset on top.
	await advancePastCycleStart({ ctx, testClockId, cycleStartsAt: anchorMs });
	await expectSubscriptionInvoiceTotals({
		ctx,
		subscriptionId: newSubscription.id,
		totals: [...(stubTotal > 0 ? [stubTotal] : []), MONTHLY_TOTAL],
	});
};

test.concurrent(
	`${chalk.yellowBright("set-plans trial end anchor: unset proration defaults to none, billing nothing until the anchor")}`,
	async () => {
		await endTrialOnAnchorAndExpect({
			customerId: "set-plans-trial-anchor-unset",
			expectedStub: () => 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans trial end anchor: none bills nothing until the anchor")}`,
	async () => {
		await endTrialOnAnchorAndExpect({
			customerId: "set-plans-trial-anchor-none",
			prorationBehavior: "none",
			expectedStub: () => 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans trial end anchor: prorate_immediately bills the stub to the anchor now")}`,
	async () => {
		await endTrialOnAnchorAndExpect({
			customerId: "set-plans-trial-anchor-prorate",
			prorationBehavior: "prorate_immediately",
			expectedStub: proratedStub,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans trial end anchor: bill_difference prorates the stub like prorate_immediately")}`,
	async () => {
		await endTrialOnAnchorAndExpect({
			customerId: "set-plans-trial-anchor-bill-diff",
			prorationBehavior: "bill_difference",
			expectedStub: proratedStub,
		});
	},
);
