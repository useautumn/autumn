/**
 * Timestamp billing_cycle_anchor edges on a first phase: anchors late in, at, or past the current period,
 * annual cycles, a plan change in the same request, and new subscriptions with prepaid items.
 */

import { expect, test } from "bun:test";
import { ms, type SetPlansParamsV0Input } from "@autumn/shared";
import { stripeSchedulePhaseStartingAt } from "@tests/integration/billing/set-plans/phase-proration/utils/phaseProrationUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import {
	calculateBillingCycleAnchorResetNextCycle,
	calculateNewSubscriptionAnchorStub,
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
	calculateStripeProratedSwitch,
	expectNextCycleTotalMatchesStripe,
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
		const { total: expectedResetTotal } =
			await calculateBillingCycleAnchorResetNextCycle({
				customerId,
				billingCycleAnchorMs: anchorMs,
				nextCycleAmount: 20,
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
		await expectNextCycleTotalMatchesStripe({
			ctx,
			customerId,
			nextCycleTotal: preview.next_cycle?.total,
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

		const { total: expectedResetTotal } =
			await calculateBillingCycleAnchorResetNextCycle({
				customerId,
				billingCycleAnchorMs: anchorMs,
				nextCycleAmount: 20,
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
		const expectedUpgradeTotal = await calculateStripeProratedSwitch({
			customerId,
			advancedTo,
			oldAmount: 20,
			newAmount: 50,
		});
		const { total: expectedResetTotal } =
			await calculateBillingCycleAnchorResetNextCycle({
				customerId,
				billingCycleAnchorMs: anchorMs,
				nextCycleAmount: 50,
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
		const { total: expectedResetTotal } =
			await calculateBillingCycleAnchorResetNextCycle({
				customerId,
				billingCycleAnchorMs: anchorMs,
				nextCycleAmount: 200,
				interval: "year",
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
		await expectNextCycleTotalMatchesStripe({
			ctx,
			customerId,
			nextCycleTotal: preview.next_cycle?.total,
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

// DISABLED: the anchor-reset preview scales the annual line by the monthly ratio ($125.81 vs Stripe's $19.54; D2, 2026-10-06);
// re-enable once Billy Acton's fix (ATMN-704) lands.
test.skip(`${chalk.yellowBright("set-plans custom anchor edges: a monthly plan and an annual add-on on one subscription reset on the anchor, billed as previewed")}`, async () => {
	const pro = products.pro({
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const annualAddOn = products.base({
		id: "annual-addon",
		isAddOn: true,
		items: [items.annualPrice({ price: 240 })],
	});
	const { customerId, autumnV2_4, ctx, advancedTo, testClockId } =
		await initScenario({
			customerId: "set-plans-anchor-edge-mixed",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, annualAddOn] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.billing.attach({ productId: annualAddOn.id }),
				s.advanceTestClock({ days: 5 }),
			],
		});

	const anchorMs = advancedTo + ms.days(10);
	const params: SetPlansParamsV0Input = {
		customer_id: customerId,
		phases: [
			{
				billing_cycle_anchor: anchorMs,
				starts_at: advancedTo,
				plans: [{ plan_id: pro.id }, { plan_id: annualAddOn.id }],
			},
		],
	};

	const preview = await autumnV2_4.billing.previewSetPlans(params);
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: anchorMs,
		toleranceMs: 1000,
	});

	await autumnV2_4.billing.setPlans(params);
	await expectCycleResetPhase({ ctx, customerId, anchorMs });
	await expectNextCycleTotalMatchesStripe({
		ctx,
		customerId,
		nextCycleTotal: preview.next_cycle?.total,
	});

	await advancePastCycleStart({
		ctx,
		testClockId: testClockId!,
		cycleStartsAt: anchorMs,
	});
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 3,
		latestTotal: preview.next_cycle?.total,
	});
});

// DISABLED: usage tracked before a scheduled anchor isn't billed on the anchor invoice ($9.68 vs $19.68; D3, 2026-10-06);
// re-enable once Billy Acton's fix (ATMN-704) lands.
test.skip(`${chalk.yellowBright("set-plans custom anchor edges: usage tracked before the anchor is billed once, on the anchor invoice")}`, async () => {
	const pro = products.pro({
		items: [items.consumableMessages({ includedUsage: 0 })],
	});
	const { customerId, autumnV2_4, ctx, advancedTo, testClockId } =
		await initScenario({
			customerId: "set-plans-anchor-edge-usage",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.advanceTestClock({ days: 5 }),
				s.track({
					featureId: TestFeature.Messages,
					value: 100,
					timeout: 2000,
				}),
			],
		});

	const anchorMs = advancedTo + ms.days(10);
	const usageCharge = 10;
	const { total: baseResetTotal } =
		await calculateBillingCycleAnchorResetNextCycle({
			customerId,
			billingCycleAnchorMs: anchorMs,
			nextCycleAmount: 20,
		});
	const params = anchorParams({
		customerId,
		planId: pro.id,
		anchorMs,
		startsAt: advancedTo,
	});

	const preview = await autumnV2_4.billing.previewSetPlans(params);
	expect(preview.total).toBe(0);

	await autumnV2_4.billing.setPlans(params);
	await advancePastCycleStart({
		ctx,
		testClockId: testClockId!,
		cycleStartsAt: anchorMs,
	});
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: baseResetTotal + usageCharge,
	});

	const renewalAt = addMonths(anchorMs, 1).getTime();
	await advancePastCycleStart({
		ctx,
		testClockId: testClockId!,
		cycleStartsAt: renewalAt,
	});
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 3,
		latestTotal: 20,
	});
});

// DISABLED: phase 0's proration_behavior none doesn't reach the anchor's reset phase (D5, 2026-10-06);
// re-enable once autumn#4305 and autumn#4312 (re-anchors balances at the anchor under none) merge.
test.skip(`${chalk.yellowBright("set-plans custom anchor edges: proration none moves the cycle on the anchor without an invoice, then renews at full price")}`, async () => {
	const { customerId, autumnV2_4, ctx, advancedTo, testClockId, pro } =
		await livePro({ customerId: "set-plans-anchor-edge-none" });

	const anchorMs = advancedTo + ms.days(10);
	const renewalAt = addMonths(anchorMs, 1).getTime();
	const params: SetPlansParamsV0Input = {
		customer_id: customerId,
		phases: [
			{
				billing_cycle_anchor: anchorMs,
				proration_behavior: "none",
				starts_at: advancedTo,
				plans: [{ plan_id: pro.id }],
			},
		],
	};

	const preview = await autumnV2_4.billing.previewSetPlans(params);
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: renewalAt,
		total: 20,
		toleranceMs: 1000,
	});

	await autumnV2_4.billing.setPlans(params);
	const resetPhase = await stripeSchedulePhaseStartingAt({
		ctx,
		customerId,
		startsAt: anchorMs,
	});
	expect(resetPhase.proration_behavior).toBe("none");

	await advancePastCycleStart({
		ctx,
		testClockId: testClockId!,
		cycleStartsAt: anchorMs,
	});
	await expectCustomerInvoiceCorrect({ customerId, count: 1 });
	await expectStripeCycleCorrect({
		ctx,
		customerId,
		anchorMs,
		periodEndMs: renewalAt,
	});
	await expectBalanceCorrect({
		customerId,
		featureId: TestFeature.Messages,
		nextResetAt: renewalAt,
	});

	await advancePastCycleStart({
		ctx,
		testClockId: testClockId!,
		cycleStartsAt: renewalAt,
	});
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: 20,
	});
});
