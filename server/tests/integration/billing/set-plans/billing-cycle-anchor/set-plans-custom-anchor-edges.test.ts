/**
 * Timestamp billing_cycle_anchor edges on a first phase: anchors late in, at, or past the current period,
 * annual cycles, a plan change in the same request, and new subscriptions with prepaid items.
 */

import { expect, test } from "bun:test";
import { ms, type SetPlansParamsV0Input } from "@autumn/shared";
import { expectPreviewMatchesStripeUpcomingInvoice } from "@tests/integration/billing/set-plans/phase-proration/utils/phaseProrationUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import {
	calculateNewSubscriptionAnchorStub,
	calculateProratedDiff,
	getBillingPeriod,
} from "@tests/integration/billing/utils/proration";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths, addYears } from "date-fns";
import { expectCycleResetPhase } from "../utils/resyncUtils";
import {
	advancePastCycleStart,
	calculateStripeAnchorResetTotal,
	expectStripeCycleCorrect,
} from "./utils/anchorCycleUtils";

const anchorParams = ({
	customerId,
	planId,
	anchorMs,
	startsAt,
	quantity,
}: {
	customerId: string;
	planId: string;
	anchorMs: number;
	startsAt: number;
	quantity?: number;
}): SetPlansParamsV0Input => ({
	customer_id: customerId,
	phases: [
		{
			billing_cycle_anchor: anchorMs,
			starts_at: startsAt,
			plans: [
				{
					plan_id: planId,
					...(quantity !== undefined && {
						feature_quantities: [
							{ feature_id: TestFeature.Messages, quantity },
						],
					}),
				},
			],
		},
	],
});

const livePro = ({ customerId }: { customerId: string }) => {
	const pro = products.pro({
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	return initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.advanceTestClock({ days: 5 }),
		],
	}).then((scenario) => ({ ...scenario, pro }));
};

test.concurrent(
	`${chalk.yellowBright("set-plans custom anchor edges: an anchor late in the period previews what Stripe invoices on it")}`,
	async () => {
		const { customerId, autumnV2_4, ctx, advancedTo, testClockId, pro } =
			await livePro({ customerId: "set-plans-anchor-edge-late" });

		const { billingPeriod } = await getBillingPeriod({ customerId });
		const anchorMs = billingPeriod.end - ms.days(5);
		const expectedResetTotal = await calculateStripeAnchorResetTotal({
			customerId,
			anchorMs,
			amount: 20,
		});
		const params = anchorParams({
			customerId,
			planId: pro.id,
			anchorMs,
			startsAt: advancedTo,
		});

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(0);
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: anchorMs,
			total: expectedResetTotal,
			toleranceMs: 1000,
		});

		await autumnV2_4.billing.setPlans(params);
		await expectCycleResetPhase({ ctx, customerId, anchorMs });
		await expectPreviewMatchesStripeUpcomingInvoice({
			ctx,
			customerId,
			nextCycle: preview.next_cycle,
		});

		await advancePastCycleStart({
			ctx,
			testClockId: testClockId!,
			cycleStartsAt: anchorMs,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: expectedResetTotal,
		});
		await expectStripeCycleCorrect({
			ctx,
			customerId,
			anchorMs,
			periodEndMs: addMonths(anchorMs, 1).getTime(),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans custom anchor edges: an anchor exactly at period end renews once, at full price")}`,
	async () => {
		const { customerId, autumnV2_4, ctx, advancedTo, testClockId, pro } =
			await livePro({ customerId: "set-plans-anchor-edge-period-end" });

		const { billingPeriod } = await getBillingPeriod({ customerId });
		const anchorMs = billingPeriod.end;
		const params = anchorParams({
			customerId,
			planId: pro.id,
			anchorMs,
			startsAt: advancedTo,
		});

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(0);
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: anchorMs,
			total: 20,
			toleranceMs: 1000,
		});

		await autumnV2_4.billing.setPlans(params);
		await expectCustomerInvoiceCorrect({ customerId, count: 1 });

		await advancePastCycleStart({
			ctx,
			testClockId: testClockId!,
			cycleStartsAt: anchorMs,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 20,
		});
		await expectStripeCycleCorrect({
			ctx,
			customerId,
			periodEndMs: addMonths(anchorMs, 1).getTime(),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans custom anchor edges: an anchor past period end renews first, then resets on the anchor")}`,
	async () => {
		const { customerId, autumnV2_4, ctx, advancedTo, testClockId, pro } =
			await livePro({ customerId: "set-plans-anchor-edge-past-period" });

		const { billingPeriod } = await getBillingPeriod({ customerId });
		const anchorMs = billingPeriod.end + ms.days(10);
		const params = anchorParams({
			customerId,
			planId: pro.id,
			anchorMs,
			startsAt: advancedTo,
		});

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(0);
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: billingPeriod.end,
			total: 20,
			toleranceMs: 1000,
		});

		await autumnV2_4.billing.setPlans(params);
		await expectCycleResetPhase({ ctx, customerId, anchorMs });
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			nextResetAt: billingPeriod.end,
		});

		await advancePastCycleStart({
			ctx,
			testClockId: testClockId!,
			cycleStartsAt: billingPeriod.end,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 20,
		});

		const expectedResetTotal = await calculateStripeAnchorResetTotal({
			customerId,
			anchorMs,
			amount: 20,
		});
		await advancePastCycleStart({
			ctx,
			testClockId: testClockId!,
			cycleStartsAt: anchorMs,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: expectedResetTotal,
		});
		await expectStripeCycleCorrect({
			ctx,
			customerId,
			anchorMs,
			periodEndMs: addMonths(anchorMs, 1).getTime(),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans custom anchor edges: an upgrade with a future anchor bills the prorated upgrade now and the reset on the anchor")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const { customerId, autumnV2_4, ctx, advancedTo, testClockId } =
			await initScenario({
				customerId: "set-plans-anchor-edge-upgrade",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro, premium] }),
				],
				actions: [
					s.billing.attach({ productId: pro.id }),
					s.advanceTestClock({ days: 5 }),
				],
			});

		const anchorMs = advancedTo + ms.days(10);
		const expectedUpgradeTotal = await calculateProratedDiff({
			customerId,
			advancedTo,
			oldAmount: 20,
			newAmount: 50,
		});
		const expectedResetTotal = await calculateStripeAnchorResetTotal({
			customerId,
			anchorMs,
			amount: 50,
		});
		const params = anchorParams({
			customerId,
			planId: premium.id,
			anchorMs,
			startsAt: advancedTo,
		});

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(expectedUpgradeTotal);
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: anchorMs,
			total: expectedResetTotal,
			toleranceMs: 1000,
		});

		await autumnV2_4.billing.setPlans(params);
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: expectedUpgradeTotal,
		});
		await expectCycleResetPhase({ ctx, customerId, anchorMs });
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 500,
			nextResetAt: anchorMs,
		});

		await advancePastCycleStart({
			ctx,
			testClockId: testClockId!,
			cycleStartsAt: anchorMs,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: expectedResetTotal,
		});
		await expectStripeCycleCorrect({
			ctx,
			customerId,
			anchorMs,
			periodEndMs: addMonths(anchorMs, 1).getTime(),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans custom anchor edges: a live annual plan resets on the anchor, billed as previewed")}`,
	async () => {
		const proAnnual = products.proAnnual({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId, autumnV2_4, ctx, advancedTo, testClockId } =
			await initScenario({
				customerId: "set-plans-anchor-edge-annual-live",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [proAnnual] }),
				],
				actions: [
					s.billing.attach({ productId: proAnnual.id }),
					s.advanceTestClock({ days: 5 }),
				],
			});

		const anchorMs = advancedTo + ms.days(10);
		const expectedResetTotal = await calculateStripeAnchorResetTotal({
			customerId,
			anchorMs,
			amount: 200,
		});
		const params = anchorParams({
			customerId,
			planId: proAnnual.id,
			anchorMs,
			startsAt: advancedTo,
		});

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(0);
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: anchorMs,
			total: expectedResetTotal,
			toleranceMs: 1000,
		});

		await autumnV2_4.billing.setPlans(params);
		await expectCycleResetPhase({ ctx, customerId, anchorMs });
		await expectPreviewMatchesStripeUpcomingInvoice({
			ctx,
			customerId,
			nextCycle: preview.next_cycle,
		});

		await advancePastCycleStart({
			ctx,
			testClockId: testClockId!,
			cycleStartsAt: anchorMs,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: expectedResetTotal,
		});
		await expectStripeCycleCorrect({
			ctx,
			customerId,
			anchorMs,
			periodEndMs: addYears(anchorMs, 1).getTime(),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans custom anchor edges: a new annual subscription bills a stub until the anchor, then a full year")}`,
	async () => {
		const proAnnual = products.proAnnual({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId, autumnV2_4, ctx, advancedTo, testClockId } =
			await initScenario({
				customerId: "set-plans-anchor-edge-annual-new",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [proAnnual] }),
				],
				actions: [],
			});

		const anchorMs = advancedTo + ms.days(10);
		const expectedStub = calculateNewSubscriptionAnchorStub({
			advancedTo,
			anchorMs,
			amount: 200,
			interval: "year",
		});
		const params = anchorParams({
			customerId,
			planId: proAnnual.id,
			anchorMs,
			startsAt: advancedTo,
		});

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(expectedStub);
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: anchorMs,
			total: 200,
			toleranceMs: 1000,
		});

		await autumnV2_4.billing.setPlans(params);
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: expectedStub,
		});
		await expectStripeCycleCorrect({
			ctx,
			customerId,
			anchorMs,
			periodEndMs: anchorMs,
		});

		await advancePastCycleStart({
			ctx,
			testClockId: testClockId!,
			cycleStartsAt: anchorMs,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 200,
		});
		await expectStripeCycleCorrect({
			ctx,
			customerId,
			anchorMs,
			periodEndMs: addYears(anchorMs, 1).getTime(),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans custom anchor edges: a new prepaid subscription stubs to the anchor, where its balance refills")}`,
	async () => {
		const pro = products.pro({
			items: [items.prepaidMessages({ billingUnits: 100, price: 10 })],
		});
		const { customerId, autumnV2_4, ctx, advancedTo, testClockId } =
			await initScenario({
				customerId: "set-plans-anchor-edge-prepaid-new",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro] }),
				],
				actions: [],
			});

		const anchorMs = advancedTo + ms.days(10);
		const expectedStub = calculateNewSubscriptionAnchorStub({
			advancedTo,
			anchorMs,
			amount: 50,
		});
		const params = anchorParams({
			customerId,
			planId: pro.id,
			anchorMs,
			startsAt: advancedTo,
			quantity: 300,
		});

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(expectedStub);
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: anchorMs,
			total: 50,
			toleranceMs: 1000,
		});

		await autumnV2_4.billing.setPlans(params);
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 1,
			latestTotal: expectedStub,
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 300,
			nextResetAt: anchorMs,
		});

		await autumnV2_4.track(
			{ customer_id: customerId, feature_id: TestFeature.Messages, value: 120 },
			{ timeout: 2000 },
		);
		await advancePastCycleStart({
			ctx,
			testClockId: testClockId!,
			cycleStartsAt: anchorMs,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 50,
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 300,
			nextResetAt: addMonths(anchorMs, 1).getTime(),
		});
	},
);
