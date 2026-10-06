/**
 * A first phase starting now with billing_cycle_anchor 'phase_start' resets the live cycle now:
 * Stripe bills the full new cycle less the old cycle's unused time, then renews one interval later.
 */

import { expect, test } from "bun:test";
import {
	type BillingBehavior,
	ErrCode,
	type SetPlansParamsV0Input,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectPreviewNextCycleCorrect } from "@tests/integration/billing/utils/expectPreviewNextCycleCorrect";
import { calculateResetBillingCycleNowTotal } from "@tests/integration/billing/utils/proration";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths, addYears } from "date-fns";
import {
	advancePastCycleStart,
	expectStripeCycleCorrect,
} from "./utils/anchorCycleUtils";

const resetNowParams = ({
	customerId,
	planId,
	quantity,
	prorationBehavior,
}: {
	customerId: string;
	planId: string;
	quantity?: number;
	prorationBehavior?: BillingBehavior;
}): SetPlansParamsV0Input => ({
	customer_id: customerId,
	phases: [
		{
			starts_at: "now",
			billing_cycle_anchor: "phase_start",
			...(prorationBehavior && { proration_behavior: prorationBehavior }),
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

test.concurrent(
	`${chalk.yellowBright("set-plans anchor now: an upgrade mid-cycle bills the new cycle less unused time, then renews a month later")}`,
	async () => {
		const pro = products.pro({
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const { customerId, autumnV2_4, ctx, advancedTo, testClockId } =
			await initScenario({
				customerId: "set-plans-anchor-now-upgrade",
				setup: [
					s.customer({ paymentMethod: "success" }),
					s.products({ list: [pro, premium] }),
				],
				actions: [
					s.billing.attach({ productId: pro.id }),
					s.advanceTestClock({ days: 10 }),
				],
			});

		const renewalAt = addMonths(advancedTo, 1).getTime();
		const expectedTotal = await calculateResetBillingCycleNowTotal({
			customerId,
			advancedTo,
			oldAmount: 20,
			newAmount: 50,
		});
		const params = resetNowParams({ customerId, planId: premium.id });

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(expectedTotal);
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: renewalAt,
			total: 50,
			toleranceMs: 1000,
		});

		await autumnV2_4.billing.setPlans(params);

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: expectedTotal,
		});
		await expectStripeCycleCorrect({
			ctx,
			customerId,
			anchorMs: advancedTo,
			periodEndMs: renewalAt,
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

// DISABLED: reset now leaves a kept plan unbilled and on its old reset date (D1, a confirmed bug Charlie wants fixed, 2026-10-06);
// re-enable once Billy Acton's fix (ATMN-704) re-anchors and bills kept plans on reset now (computeSetPlansPlan.ts).
test.skip(`${chalk.yellowBright("set-plans anchor now: the same plan restarts its cycle now, billed as previewed")}`, async () => {
	const pro = products.pro({
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { customerId, autumnV2_4, ctx, advancedTo } = await initScenario({
		customerId: "set-plans-anchor-now-same-plan",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.advanceTestClock({ days: 10 }),
		],
	});

	const renewalAt = addMonths(advancedTo, 1).getTime();
	const expectedTotal = await calculateResetBillingCycleNowTotal({
		customerId,
		advancedTo,
		oldAmount: 20,
		newAmount: 20,
	});
	const params = resetNowParams({ customerId, planId: pro.id });

	const preview = await autumnV2_4.billing.previewSetPlans(params);
	expect(preview.total).toBe(expectedTotal);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: renewalAt,
		total: 20,
		toleranceMs: 1000,
	});

	await autumnV2_4.billing.setPlans(params);

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: expectedTotal,
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
		nextResetAt: renewalAt,
	});
});

// DISABLED: reset now leaves a kept plan unbilled and on its old reset date (D1, a confirmed bug Charlie wants fixed, 2026-10-06);
// re-enable once Billy Acton's fix (ATMN-704) re-anchors and bills kept plans on reset now (computeSetPlansPlan.ts).
test.skip(`${chalk.yellowBright("set-plans anchor now: an annual plan restarts its year now, billed as previewed")}`, async () => {
	const proAnnual = products.proAnnual({
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const { customerId, autumnV2_4, ctx, advancedTo } = await initScenario({
		customerId: "set-plans-anchor-now-annual",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proAnnual] }),
		],
		actions: [
			s.billing.attach({ productId: proAnnual.id }),
			s.advanceTestClock({ days: 40 }),
		],
	});

	const renewalAt = addYears(advancedTo, 1).getTime();
	const expectedTotal = await calculateResetBillingCycleNowTotal({
		customerId,
		advancedTo,
		oldAmount: 200,
		newAmount: 200,
		interval: "year",
	});
	const params = resetNowParams({ customerId, planId: proAnnual.id });

	const preview = await autumnV2_4.billing.previewSetPlans(params);
	expect(preview.total).toBe(expectedTotal);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: renewalAt,
		total: 200,
		toleranceMs: 1000,
	});

	await autumnV2_4.billing.setPlans(params);

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: expectedTotal,
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
		nextResetAt: addMonths(advancedTo, 1).getTime(),
	});
});

// DISABLED: reset now leaves a kept plan unbilled and on its old reset date (D1, a confirmed bug Charlie wants fixed, 2026-10-06);
// re-enable once Billy Acton's fix (ATMN-704) re-anchors and bills kept plans on reset now (computeSetPlansPlan.ts).
test.skip(`${chalk.yellowBright("set-plans anchor now: a prepaid plan restarts its paid cycle with a full balance, refilled again at renewal")}`, async () => {
	const pro = products.pro({
		items: [items.prepaidMessages({ billingUnits: 100, price: 10 })],
	});
	const { customerId, autumnV2_4, ctx, advancedTo, testClockId } =
		await initScenario({
			customerId: "set-plans-anchor-now-prepaid",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [
				s.billing.attach({
					productId: pro.id,
					options: [{ feature_id: TestFeature.Messages, quantity: 300 }],
				}),
				s.advanceTestClock({ days: 10 }),
				s.track({
					featureId: TestFeature.Messages,
					value: 100,
					timeout: 2000,
				}),
			],
		});

	const renewalAt = addMonths(advancedTo, 1).getTime();
	const expectedTotal = await calculateResetBillingCycleNowTotal({
		customerId,
		advancedTo,
		oldAmount: 50,
		newAmount: 50,
	});
	const params = resetNowParams({
		customerId,
		planId: pro.id,
		quantity: 300,
	});

	const preview = await autumnV2_4.billing.previewSetPlans(params);
	expect(preview.total).toBe(expectedTotal);
	expectPreviewNextCycleCorrect({
		preview,
		startsAt: renewalAt,
		total: 50,
		toleranceMs: 1000,
	});

	await autumnV2_4.billing.setPlans(params);

	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: expectedTotal,
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
		remaining: 300,
		nextResetAt: renewalAt,
	});

	await autumnV2_4.track(
		{ customer_id: customerId, feature_id: TestFeature.Messages, value: 120 },
		{ timeout: 2000 },
	);
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
	await expectBalanceCorrect({
		customerId,
		featureId: TestFeature.Messages,
		remaining: 300,
		nextResetAt: addMonths(renewalAt, 1).getTime(),
	});
});

const setupLiveUpgrade = ({ customerId }: { customerId: string }) => {
	const pro = products.pro({
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});
	return initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.advanceTestClock({ days: 10 }),
		],
	}).then((scenario) => ({ ...scenario, pro, premium }));
};

test.concurrent(
	`${chalk.yellowBright("set-plans anchor now: an upgrade with proration none charges the new full cycle with no credit")}`,
	async () => {
		const { customerId, autumnV2_4, ctx, advancedTo, premium } =
			await setupLiveUpgrade({ customerId: "set-plans-anchor-now-none" });

		const renewalAt = addMonths(advancedTo, 1).getTime();
		const params = resetNowParams({
			customerId,
			planId: premium.id,
			prorationBehavior: "none",
		});

		const preview = await autumnV2_4.billing.previewSetPlans(params);
		expect(preview.total).toBe(50);
		expectPreviewNextCycleCorrect({
			preview,
			startsAt: renewalAt,
			total: 50,
			toleranceMs: 1000,
		});

		await autumnV2_4.billing.setPlans(params);

		await expectCustomerInvoiceCorrect({
			customerId,
			count: 2,
			latestTotal: 50,
		});
		await expectStripeCycleCorrect({
			ctx,
			customerId,
			anchorMs: advancedTo,
			periodEndMs: renewalAt,
		});
	},
);

// DISABLED: bill_difference with reset now credits the whole old period instead of its unused part (D8, a bug Charlie wants fixed, 2026-10-06);
// re-enable once Billy Acton's fix (ATMN-704) lands.
test.skip(`${chalk.yellowBright("set-plans anchor now: an upgrade with bill_difference credits only the unused old period")}`, async () => {
	const { customerId, autumnV2_4, advancedTo, premium } =
		await setupLiveUpgrade({
			customerId: "set-plans-anchor-now-bill-difference",
		});

	const expectedTotal = await calculateResetBillingCycleNowTotal({
		customerId,
		advancedTo,
		oldAmount: 20,
		newAmount: 50,
	});
	const params = resetNowParams({
		customerId,
		planId: premium.id,
		prorationBehavior: "bill_difference",
	});

	const preview = await autumnV2_4.billing.previewSetPlans(params);
	expect(preview.total).toBe(expectedTotal);

	await autumnV2_4.billing.setPlans(params);
	await expectCustomerInvoiceCorrect({
		customerId,
		count: 2,
		latestTotal: expectedTotal,
	});
});

// DISABLED: reset now on a trialing subscription is accepted today; Charlie wants a clean 400 (B6, 2026-10-06);
// re-enable once Billy Acton's rejection (ATMN-704) lands.
test.skip(`${chalk.yellowBright("set-plans anchor now: a trialing subscription can't reset its cycle now")}`, async () => {
	const proTrial = products.proWithTrial({
		items: [items.monthlyMessages({ includedUsage: 100 })],
		trialDays: 14,
	});
	const { customerId, autumnV2_4 } = await initScenario({
		customerId: "set-plans-anchor-now-trialing",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [proTrial] }),
		],
		actions: [
			s.billing.attach({ productId: proTrial.id }),
			s.advanceTestClock({ days: 2 }),
		],
	});

	await expectAutumnError({
		errCode: ErrCode.InvalidRequest,
		func: () =>
			autumnV2_4.billing.setPlans(
				resetNowParams({ customerId, planId: proTrial.id }),
			),
	});
});
