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
	`${chalk.yellowBright("set-plans canceled kept: unset proration defaults to none and charges nothing until the old period end")}`,
	async () => {
		await relistAndExpectKeptCycle({
			customerId: "set-plans-canceled-kept-unset",
			expectedStub: () => 0,
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
