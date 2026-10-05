/** A later phase's proration_behavior is saved on its schedule phase and decides how Stripe bills that phase's start. */

import { expect, test } from "bun:test";
import type { PhaseProrationBehavior } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import chalk from "chalk";
import type Stripe from "stripe";
import {
	advancePastPhaseStartAndGetInvoices,
	expectSavedPhaseProration,
	invoicesTotal,
	setupPhaseProrationScenario,
	stripeSchedulePhaseStartingAt,
	twoPhaseParams,
} from "./utils/phaseProrationUtils";

const setupUpgrade = async ({
	customerId,
	billingCycleAnchor,
	prorationBehavior,
}: {
	customerId: string;
	billingCycleAnchor?: "phase_start";
	prorationBehavior?: PhaseProrationBehavior;
}) => {
	const scenario = await setupPhaseProrationScenario({ customerId });
	const params = twoPhaseParams({
		customerId,
		laterPhaseStartsAt: scenario.laterPhaseStartsAt,
		openingPlanIds: [scenario.pro.id],
		laterPlanIds: [scenario.premium.id],
		billingCycleAnchor,
		prorationBehavior,
	});
	await scenario.autumnV2_4.billing.setPlans(params);
	return { ...scenario, params };
};

test.concurrent(
	`${chalk.yellowBright("phase proration: a kept-anchor upgrade with none charges nothing at the phase start")}`,
	async () => {
		const customerId = "phase-proration-kept-none";
		const { ctx, testClockId, laterPhaseStartsAt } = await setupUpgrade({
			customerId,
			prorationBehavior: "none",
		});

		const stripePhase = await stripeSchedulePhaseStartingAt({
			ctx,
			customerId,
			startsAt: laterPhaseStartsAt,
		});
		expect(stripePhase.proration_behavior).toBe("none");
		await expectSavedPhaseProration({
			ctx,
			customerId,
			startsAt: laterPhaseStartsAt,
			prorationBehavior: "none",
		});

		const invoices = await advancePastPhaseStartAndGetInvoices({
			ctx,
			customerId,
			testClockId: testClockId!,
			laterPhaseStartsAt,
		});
		expect(invoicesTotal(invoices)).toBe(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("phase proration: a kept-anchor upgrade with prorate_immediately charges the prorated difference at the phase start")}`,
	async () => {
		const customerId = "phase-proration-kept-prorated";
		const { ctx, testClockId, laterPhaseStartsAt } = await setupUpgrade({
			customerId,
			prorationBehavior: "prorate_immediately",
		});

		const stripePhase = await stripeSchedulePhaseStartingAt({
			ctx,
			customerId,
			startsAt: laterPhaseStartsAt,
		});
		expect(stripePhase.proration_behavior).toBe("always_invoice");

		const invoices = await advancePastPhaseStartAndGetInvoices({
			ctx,
			customerId,
			testClockId: testClockId!,
			laterPhaseStartsAt,
		});
		const fullUpgradeDifferenceCents = (50 - 20) * 100;
		expect(invoicesTotal(invoices)).toBeGreaterThan(0);
		expect(invoicesTotal(invoices)).toBeLessThan(fullUpgradeDifferenceCents);
	},
);

test.concurrent(
	`${chalk.yellowBright("phase proration: a mid-cycle reset with prorate_immediately credits the unused old plan")}`,
	async () => {
		const customerId = "phase-proration-reset-prorated";
		const { ctx, testClockId, laterPhaseStartsAt } = await setupUpgrade({
			customerId,
			billingCycleAnchor: "phase_start",
			prorationBehavior: "prorate_immediately",
		});

		const stripePhase = await stripeSchedulePhaseStartingAt({
			ctx,
			customerId,
			startsAt: laterPhaseStartsAt,
		});
		expect(stripePhase.billing_cycle_anchor).toBe("phase_start");
		expect(stripePhase.proration_behavior).toBe("always_invoice");

		const invoices = await advancePastPhaseStartAndGetInvoices({
			ctx,
			customerId,
			testClockId: testClockId!,
			laterPhaseStartsAt,
		});
		const lines = invoices.flatMap((invoice) => invoice.lines.data);
		expect(lines.some((line) => line.amount < 0)).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("phase proration: plans carried into a phase that only drops an add-on still use its proration")}`,
	async () => {
		const customerId = "phase-proration-carried";
		const { autumnV2_4, ctx, testClockId, pro, addOn, laterPhaseStartsAt } =
			await setupPhaseProrationScenario({ customerId });

		await autumnV2_4.billing.setPlans(
			twoPhaseParams({
				customerId,
				laterPhaseStartsAt,
				openingPlanIds: [pro.id, addOn.id],
				laterPlanIds: [pro.id],
				prorationBehavior: "none",
			}),
		);

		const stripePhase = await stripeSchedulePhaseStartingAt({
			ctx,
			customerId,
			startsAt: laterPhaseStartsAt,
		});
		expect(stripePhase.proration_behavior).toBe("none");
		await expectSavedPhaseProration({
			ctx,
			customerId,
			startsAt: laterPhaseStartsAt,
			prorationBehavior: "none",
		});

		const invoices = await advancePastPhaseStartAndGetInvoices({
			ctx,
			customerId,
			testClockId: testClockId!,
			laterPhaseStartsAt,
		});
		expect(invoicesTotal(invoices)).toBe(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("phase proration: a proration-only edit updates the Stripe schedule phase and the saved phase")}`,
	async () => {
		const customerId = "phase-proration-edit";
		const { autumnV2_4, ctx, params, laterPhaseStartsAt } = await setupUpgrade({
			customerId,
		});
		const [openingPhase, laterPhase] = params.phases;
		const withLaterProration = (
			prorationBehavior?: PhaseProrationBehavior,
		) => ({
			...params,
			phases: [
				openingPhase,
				{ ...laterPhase!, proration_behavior: prorationBehavior },
			],
		});
		const expectPhaseProration = async ({
			stripeProrationBehavior,
			savedProrationBehavior,
		}: {
			stripeProrationBehavior: Stripe.SubscriptionSchedule.Phase.ProrationBehavior;
			savedProrationBehavior: PhaseProrationBehavior | null;
		}) => {
			const stripePhase = await stripeSchedulePhaseStartingAt({
				ctx,
				customerId,
				startsAt: laterPhaseStartsAt,
			});
			expect(stripePhase.proration_behavior).toBe(stripeProrationBehavior);
			await expectSavedPhaseProration({
				ctx,
				customerId,
				startsAt: laterPhaseStartsAt,
				prorationBehavior: savedProrationBehavior,
			});
		};

		await expectPhaseProration({
			stripeProrationBehavior: "always_invoice",
			savedProrationBehavior: null,
		});

		await autumnV2_4.billing.setPlans(withLaterProration("none"));
		await expectPhaseProration({
			stripeProrationBehavior: "none",
			savedProrationBehavior: "none",
		});

		await autumnV2_4.billing.setPlans(withLaterProration());
		await expectPhaseProration({
			stripeProrationBehavior: "always_invoice",
			savedProrationBehavior: null,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("phase proration: rejects bill_difference and a timestamp anchor on a later phase")}`,
	async () => {
		const customerId = "phase-proration-errors";
		const { autumnV2_4, pro, premium, laterPhaseStartsAt } =
			await setupPhaseProrationScenario({ customerId });
		const params = twoPhaseParams({
			customerId,
			laterPhaseStartsAt,
			openingPlanIds: [pro.id],
			laterPlanIds: [premium.id],
		});
		const [openingPhase, laterPhase] = params.phases;

		await expectAutumnError({
			errMessage: "'bill_difference' is only supported on the first phase",
			func: () =>
				autumnV2_4.billing.setPlans({
					...params,
					phases: [
						openingPhase,
						{ ...laterPhase!, proration_behavior: "bill_difference" },
					],
				}),
		});

		await expectAutumnError({
			errMessage:
				"A timestamp billing_cycle_anchor is only supported on the first phase",
			func: () =>
				autumnV2_4.billing.setPlans({
					...params,
					phases: [
						openingPhase,
						{ ...laterPhase!, billing_cycle_anchor: laterPhaseStartsAt },
					],
				}),
		});
	},
);
