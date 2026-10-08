/**
 * Re-listing a plan whose Stripe subscription was canceled (webhook missed) recreates the subscription on the
 * old period end. Like Stripe's subscriptions.create with a future billing_cycle_anchor, proration_behavior
 * decides the stub until that anchor: none bills nothing, prorate_immediately (and bill_difference, which
 * Stripe has no equivalent for, by the new-subscription rule) bills the prorated stub now. phase_start resets the cycle and bills a full period.
 *
 * Red (before):  prorate_immediately and bill_difference previewed $0 while Stripe invoiced the stub; phase_start
 *                previewed a credit for the canceled period that Stripe never issues ($6.45, invoiced $20).
 * Green (after): each preview matches the invoice Stripe raises on create.
 */

import { expect, test } from "bun:test";
import type { BillingBehavior, SetPlansParamsV0Input } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { calculateNewSubscriptionAnchorStub } from "@tests/integration/billing/utils/proration";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { CusService } from "@/internal/customers/CusService";
import {
	advancePastCycleStart,
	expectStripeCycleCorrect,
} from "../billing-cycle-anchor/utils/anchorCycleUtils";
import {
	cancelSubscriptionMissingWebhook,
	expectPlanKept,
} from "../utils/resyncUtils";
import {
	expectLiveSubscriptionCharged,
	expectSubscriptionInvoiceTotals,
	findStripeSubscriptionByStatus,
} from "../utils/subscriptionStateUtils";

const PRO_PRICE = 20;
const INCLUDED_MESSAGES = 100;
const TRACKED_MESSAGES = 40;

/** Pro with 40 messages used, 10 days into its cycle, its Stripe subscription canceled behind Autumn's back. */
const setupCanceledPro = async ({ customerId }: { customerId: string }) => {
	const pro = products.pro({
		items: [items.monthlyMessages({ includedUsage: INCLUDED_MESSAGES })],
	});
	const { autumnV2_4, ctx, advancedTo, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.track({
				featureId: TestFeature.Messages,
				value: TRACKED_MESSAGES,
				timeout: 2000,
			}),
			s.advanceTestClock({ days: 10 }),
		],
	});
	const { customer_products: customerProducts } = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
	});
	const { oldPeriodEndMs } = await cancelSubscriptionMissingWebhook({
		ctx,
		customerId,
	});
	return {
		pro,
		autumnV2_4,
		ctx,
		advancedTo,
		testClockId: testClockId!,
		oldPeriodEndMs,
		customerProductId: customerProducts[0]!.id,
	};
};

const relistParams = ({
	customerId,
	planId,
	prorationBehavior,
}: {
	customerId: string;
	planId: string;
	prorationBehavior?: BillingBehavior;
}): SetPlansParamsV0Input => ({
	customer_id: customerId,
	phases: [
		{
			starts_at: "now",
			...(prorationBehavior && { proration_behavior: prorationBehavior }),
			plans: [{ plan_id: planId }],
		},
	],
});

/** Kept on a subscription anchored on the old period end, charged `stubTotal` now, its usage carried. */
const relistAndExpectKeptCycle = async ({
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
		autumnV2_4,
		ctx,
		advancedTo,
		testClockId,
		oldPeriodEndMs,
		customerProductId,
	} = await setupCanceledPro({ customerId });
	const stubTotal = expectedStub({ advancedTo, anchorMs: oldPeriodEndMs });
	const params = relistParams({
		customerId,
		planId: pro.id,
		prorationBehavior,
	});

	const preview = await autumnV2_4.billing.previewSetPlans(params);
	expect(preview.total).toBe(stubTotal);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: oldPeriodEndMs,
		total: PRO_PRICE,
		toleranceMs: 1000,
	});

	await autumnV2_4.billing.setPlans(params);

	await expectLiveSubscriptionCharged({ ctx, customerId, total: stubTotal });
	await expectCustomerInvoiceCorrect({
		customerId,
		count: stubTotal > 0 ? 2 : 1,
		latestTotal: stubTotal > 0 ? stubTotal : PRO_PRICE,
	});
	await expectStripeCycleCorrect({
		ctx,
		customerId,
		anchorMs: oldPeriodEndMs,
		periodEndMs: oldPeriodEndMs,
	});
	const newSubscription = await findStripeSubscriptionByStatus({
		ctx,
		customerId,
		status: "active",
	});
	await expectPlanKept({
		ctx,
		customerId,
		productId: pro.id,
		customerProductId,
		subscriptionId: newSubscription.id,
	});
	await expectBalanceCorrect({
		customerId,
		featureId: TestFeature.Messages,
		remaining: INCLUDED_MESSAGES - TRACKED_MESSAGES,
		usage: TRACKED_MESSAGES,
		nextResetAt: oldPeriodEndMs,
	});

	// The anchor bills one full renewal, with no separate cycle reset on top.
	await advancePastCycleStart({
		ctx,
		testClockId,
		cycleStartsAt: oldPeriodEndMs,
	});
	await expectSubscriptionInvoiceTotals({
		ctx,
		subscriptionId: newSubscription.id,
		totals: [...(stubTotal > 0 ? [stubTotal] : []), PRO_PRICE],
	});
};

const proratedStub = ({
	advancedTo,
	anchorMs,
}: {
	advancedTo: number;
	anchorMs: number;
}) =>
	calculateNewSubscriptionAnchorStub({
		advancedTo,
		anchorMs,
		amount: PRO_PRICE,
	});

test.concurrent(
	`${chalk.yellowBright("set-plans canceled kept: unset proration prorates like attach, charging the stub to the old period end")}`,
	async () => {
		await relistAndExpectKeptCycle({
			customerId: "set-plans-canceled-kept-unset",
			expectedStub: proratedStub,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans canceled kept: none recreates on the old period end and charges nothing until it")}`,
	async () => {
		await relistAndExpectKeptCycle({
			customerId: "set-plans-canceled-kept-none",
			prorationBehavior: "none",
			expectedStub: () => 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans canceled kept: prorate_immediately charges the stub to the old period end now, as previewed")}`,
	async () => {
		await relistAndExpectKeptCycle({
			customerId: "set-plans-canceled-kept-prorate",
			prorationBehavior: "prorate_immediately",
			expectedStub: proratedStub,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans canceled kept: bill_difference prorates the stub like prorate_immediately")}`,
	async () => {
		await relistAndExpectKeptCycle({
			customerId: "set-plans-canceled-kept-bill-diff",
			prorationBehavior: "bill_difference",
			expectedStub: proratedStub,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans canceled kept: phase_start resets the cycle now and bills a full period")}`,
	async () => {
		const customerId = "set-plans-canceled-kept-phase-start";
		const { pro, autumnV2_4, ctx, advancedTo } = await setupCanceledPro({
			customerId,
		});
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					starts_at: "now",
					billing_cycle_anchor: "phase_start",
					plans: [{ plan_id: pro.id }],
				},
			],
		};
		const renewalAt = addMonths(advancedTo, 1).getTime();

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(PRO_PRICE);

		await autumnV2_4.billing.setPlans(params);

		await expectLiveSubscriptionCharged({ ctx, customerId, total: PRO_PRICE });
		await expectCustomerProducts({ customerId, active: [pro.id] });
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: PRO_PRICE,
		});
		await expectStripeCycleCorrect({
			ctx,
			customerId,
			anchorMs: advancedTo,
			periodEndMs: renewalAt,
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: INCLUDED_MESSAGES,
			usage: 0,
			nextResetAt: renewalAt,
		});
	},
);
