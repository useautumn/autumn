/**
 * A later phase's anchor: 'phase_start' restarts the cycle at the phase (a plan switch bills the new
 * cycle in full), while no anchor keeps the running cycle and prorates the switch.
 */

import { expect, test } from "bun:test";
import { ms, type ProductV2, type SetPlansParamsV0Input } from "@autumn/shared";
import { expectPreviewMatchesStripeUpcomingInvoice } from "@tests/integration/billing/set-plans/phase-proration/utils/phaseProrationUtils";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import {
	calculateBillingCycleAnchorResetNextCycle,
	getBillingPeriod,
} from "@tests/integration/billing/utils/proration";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths, addYears } from "date-fns";
import {
	advancePastCycleStart,
	calculateStripeProratedSwitch,
	expectStripeCycleCorrect,
} from "./utils/anchorCycleUtils";

const laterPhaseParams = ({
	customerId,
	currentPlanId,
	nextPlanId,
	nextPhaseStartsAt,
	resetsCycle,
}: {
	customerId: string;
	currentPlanId: string;
	nextPlanId: string;
	nextPhaseStartsAt: number;
	resetsCycle: boolean;
}): SetPlansParamsV0Input => ({
	customer_id: customerId,
	phases: [
		{ starts_at: "now", plans: [{ plan_id: currentPlanId }] },
		{
			starts_at: nextPhaseStartsAt,
			plans: [{ plan_id: nextPlanId }],
			...(resetsCycle && { billing_cycle_anchor: "phase_start" as const }),
		},
	],
});

const setupLivePro = ({
	customerId,
	nextPlan,
}: {
	customerId: string;
	nextPlan: ProductV2;
}) => {
	const pro = products.pro({
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	return initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, nextPlan] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.advanceTestClock({ days: 5 }),
		],
	}).then((scenario) => ({ ...scenario, pro }));
};

test.concurrent(
	`${chalk.yellowBright("set-plans later phase anchor: phase_start bills the new plan's full cycle at the phase and renews a month after it")}`,
	async () => {
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const { customerId, autumnV2_4, ctx, advancedTo, testClockId, pro } =
			await setupLivePro({
				customerId: "set-plans-later-anchor-reset",
				nextPlan: premium,
			});

		const nextPhaseStartsAt = advancedTo + ms.days(10);
		const renewalAt = addMonths(nextPhaseStartsAt, 1).getTime();
		const params = laterPhaseParams({
			customerId,
			currentPlanId: pro.id,
			nextPlanId: premium.id,
			nextPhaseStartsAt,
			resetsCycle: true,
		});

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(0);
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: nextPhaseStartsAt,
			total: 50,
			toleranceMs: 1000,
		});

		await autumnV2_4.billing.setPlans(params);
		await expectPreviewMatchesStripeUpcomingInvoice({
			ctx,
			customerId,
			nextCycle: preview.next_cycle,
		});

		await advancePastCycleStart({
			ctx,
			testClockId: testClockId!,
			cycleStartsAt: nextPhaseStartsAt,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 50,
		});
		await expectStripeCycleCorrect({
			ctx,
			customerId,
			anchorMs: nextPhaseStartsAt,
			periodEndMs: renewalAt,
		});
		await expectBalanceCorrect({
			customerId,
			featureId: TestFeature.Messages,
			remaining: 500,
			nextResetAt: renewalAt,
		});

		await advancePastCycleStart({
			ctx,
			testClockId: testClockId!,
			cycleStartsAt: renewalAt,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: 50,
		});
	},
);

test(`${chalk.yellowBright("set-plans later phase anchor: no anchor prorates the switch at the phase and keeps the original renewal")}`, async () => {
	const premium = products.premium({
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});
	const { customerId, autumnV2_4, ctx, advancedTo, testClockId, pro } =
		await setupLivePro({
			customerId: "set-plans-later-anchor-kept",
			nextPlan: premium,
		});

	const { billingPeriod, billingAnchorMs } = await getBillingPeriod({
		customerId,
	});
	const nextPhaseStartsAt = advancedTo + ms.days(10);
	const expectedSwitchTotal = await calculateStripeProratedSwitch({
		customerId,
		advancedTo: nextPhaseStartsAt,
		oldAmount: 20,
		newAmount: 50,
	});
	const params = laterPhaseParams({
		customerId,
		currentPlanId: pro.id,
		nextPlanId: premium.id,
		nextPhaseStartsAt,
		resetsCycle: false,
	});

	const preview = await autumnV2_4.billing.previewSetPlans(params);
	expect(preview.total).toBe(0);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: nextPhaseStartsAt,
		total: expectedSwitchTotal,
		toleranceMs: 1000,
	});

	await autumnV2_4.billing.setPlans(params);
	await expectPreviewMatchesStripeUpcomingInvoice({
		ctx,
		customerId,
		nextCycle: preview.next_cycle,
	});

	await advancePastCycleStart({
		ctx,
		testClockId: testClockId!,
		cycleStartsAt: nextPhaseStartsAt,
	});
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: expectedSwitchTotal,
	});
	await expectStripeCycleCorrect({
		ctx,
		customerId,
		anchorMs: billingAnchorMs,
		periodEndMs: billingPeriod.end,
	});

	await advancePastCycleStart({
		ctx,
		testClockId: testClockId!,
		cycleStartsAt: billingPeriod.end,
	});
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 3,
		latestTotal: 50,
	});
});

test.concurrent(
	`${chalk.yellowBright("set-plans later phase anchor: phase_start on the renewal boundary raises one full-price invoice")}`,
	async () => {
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const { customerId, autumnV2_4, ctx, testClockId, pro } =
			await setupLivePro({
				customerId: "set-plans-later-anchor-boundary",
				nextPlan: premium,
			});

		const { billingPeriod } = await getBillingPeriod({ customerId });
		const nextPhaseStartsAt = billingPeriod.end;
		const params = laterPhaseParams({
			customerId,
			currentPlanId: pro.id,
			nextPlanId: premium.id,
			nextPhaseStartsAt,
			resetsCycle: true,
		});

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(0);
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: nextPhaseStartsAt,
			total: 50,
			toleranceMs: 1000,
		});

		await autumnV2_4.billing.setPlans(params);

		await advancePastCycleStart({
			ctx,
			testClockId: testClockId!,
			cycleStartsAt: nextPhaseStartsAt,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 50,
		});
		await expectStripeCycleCorrect({
			ctx,
			customerId,
			periodEndMs: addMonths(nextPhaseStartsAt, 1).getTime(),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans later phase anchor: a monthly-to-annual switch with phase_start bills a full year from the phase")}`,
	async () => {
		const proAnnual = products.proAnnual({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { customerId, autumnV2_4, ctx, advancedTo, testClockId, pro } =
			await setupLivePro({
				customerId: "set-plans-later-anchor-annual",
				nextPlan: proAnnual,
			});

		const nextPhaseStartsAt = advancedTo + ms.days(10);
		const params = laterPhaseParams({
			customerId,
			currentPlanId: pro.id,
			nextPlanId: proAnnual.id,
			nextPhaseStartsAt,
			resetsCycle: true,
		});

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(0);
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: nextPhaseStartsAt,
			total: 200,
			toleranceMs: 1000,
		});

		await autumnV2_4.billing.setPlans(params);
		await expectPreviewMatchesStripeUpcomingInvoice({
			ctx,
			customerId,
			nextCycle: preview.next_cycle,
		});

		await advancePastCycleStart({
			ctx,
			testClockId: testClockId!,
			cycleStartsAt: nextPhaseStartsAt,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 200,
		});
		await expectStripeCycleCorrect({
			ctx,
			customerId,
			anchorMs: nextPhaseStartsAt,
			periodEndMs: addYears(nextPhaseStartsAt, 1).getTime(),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans later phase anchor: a first-phase anchor then a later phase_start reset the cycle twice, each billed as Stripe does")}`,
	async () => {
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const { customerId, autumnV2_4, ctx, advancedTo, testClockId, pro } =
			await setupLivePro({
				customerId: "set-plans-later-anchor-two-resets",
				nextPlan: premium,
			});

		const anchorMs = advancedTo + ms.days(10);
		const nextPhaseStartsAt = advancedTo + ms.days(20);
		const { total: expectedAnchorTotal } =
			await calculateBillingCycleAnchorResetNextCycle({
				customerId,
				billingCycleAnchorMs: anchorMs,
				nextCycleAmount: 20,
			});
		const params: SetPlansParamsV0Input = {
			customer_id: customerId,
			phases: [
				{
					billing_cycle_anchor: anchorMs,
					starts_at: advancedTo,
					plans: [{ plan_id: pro.id }],
				},
				{
					billing_cycle_anchor: "phase_start",
					starts_at: nextPhaseStartsAt,
					plans: [{ plan_id: premium.id }],
				},
			],
		};

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(0);
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: anchorMs,
			total: expectedAnchorTotal,
			toleranceMs: 1000,
		});

		await autumnV2_4.billing.setPlans(params);

		await advancePastCycleStart({
			ctx,
			testClockId: testClockId!,
			cycleStartsAt: anchorMs,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: expectedAnchorTotal,
		});

		await advancePastCycleStart({
			ctx,
			testClockId: testClockId!,
			cycleStartsAt: nextPhaseStartsAt,
		});
		await expectCustomerInvoiceCorrect({
			customerId,
			count: 3,
			latestTotal: 50,
		});
		await expectStripeCycleCorrect({
			ctx,
			customerId,
			anchorMs: nextPhaseStartsAt,
			periodEndMs: addMonths(nextPhaseStartsAt, 1).getTime(),
		});
	},
);
