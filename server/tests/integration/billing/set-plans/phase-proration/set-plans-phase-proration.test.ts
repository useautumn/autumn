/** A later phase's proration_behavior decides how Stripe bills that phase's start, and is saved for reopening the schedule. */

import { expect, test } from "bun:test";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import chalk from "chalk";
import {
	advancePastPhaseStartAndGetProrationLines,
	expectScheduledPhaseProrationSaved,
	proThenPremiumParams,
	setupPhaseProrationScenario,
	stripeSchedulePhaseStartingAt,
} from "./utils/phaseProrationUtils";

const sumAmounts = (lines: { amount: number }[]) =>
	lines.reduce((total, line) => total + line.amount, 0);

test.concurrent(
	`${chalk.yellowBright("phase proration: a kept-anchor phase with none charges no proration at its start")}`,
	async () => {
		const customerId = "phase-proration-kept-none";
		const { autumnV2_4, ctx, testClockId, pro, premium, laterPhaseStartsAt } =
			await setupPhaseProrationScenario({ customerId });

		await autumnV2_4.billing.setPlans(
			proThenPremiumParams({
				customerId,
				laterPhaseStartsAt,
				proPlanId: pro.id,
				premiumPlanId: premium.id,
				prorationBehavior: "none",
			}),
		);

		const stripePhase = await stripeSchedulePhaseStartingAt({
			ctx,
			customerId,
			startsAt: laterPhaseStartsAt,
		});
		expect(stripePhase.proration_behavior).toBe("none");
		await expectScheduledPhaseProrationSaved({
			ctx,
			customerId,
			productId: premium.id,
			prorationBehavior: "none",
		});

		const prorationLines = await advancePastPhaseStartAndGetProrationLines({
			ctx,
			customerId,
			testClockId: testClockId!,
			laterPhaseStartsAt,
		});
		expect(prorationLines).toHaveLength(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("phase proration: a kept-anchor phase with prorate_immediately charges the prorated difference at its start")}`,
	async () => {
		const customerId = "phase-proration-kept-prorated";
		const { autumnV2_4, ctx, testClockId, pro, premium, laterPhaseStartsAt } =
			await setupPhaseProrationScenario({ customerId });

		await autumnV2_4.billing.setPlans(
			proThenPremiumParams({
				customerId,
				laterPhaseStartsAt,
				proPlanId: pro.id,
				premiumPlanId: premium.id,
				prorationBehavior: "prorate_immediately",
			}),
		);

		const stripePhase = await stripeSchedulePhaseStartingAt({
			ctx,
			customerId,
			startsAt: laterPhaseStartsAt,
		});
		expect(stripePhase.proration_behavior).toBe("always_invoice");

		const prorationLines = await advancePastPhaseStartAndGetProrationLines({
			ctx,
			customerId,
			testClockId: testClockId!,
			laterPhaseStartsAt,
		});
		expect(prorationLines.length).toBeGreaterThan(0);
		expect(sumAmounts(prorationLines)).toBeGreaterThan(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("phase proration: a mid-cycle reset with prorate_immediately credits the unused old plan")}`,
	async () => {
		const customerId = "phase-proration-reset-prorated";
		const { autumnV2_4, ctx, testClockId, pro, premium, laterPhaseStartsAt } =
			await setupPhaseProrationScenario({ customerId });

		await autumnV2_4.billing.setPlans(
			proThenPremiumParams({
				customerId,
				laterPhaseStartsAt,
				proPlanId: pro.id,
				premiumPlanId: premium.id,
				billingCycleAnchor: "phase_start",
				prorationBehavior: "prorate_immediately",
			}),
		);

		const stripePhase = await stripeSchedulePhaseStartingAt({
			ctx,
			customerId,
			startsAt: laterPhaseStartsAt,
		});
		expect(stripePhase.billing_cycle_anchor).toBe("phase_start");
		expect(stripePhase.proration_behavior).toBe("always_invoice");

		const prorationLines = await advancePastPhaseStartAndGetProrationLines({
			ctx,
			customerId,
			testClockId: testClockId!,
			laterPhaseStartsAt,
		});
		expect(prorationLines.some((line) => line.amount < 0)).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("phase proration: a proration-only edit updates the Stripe schedule phase and the saved value")}`,
	async () => {
		const customerId = "phase-proration-edit";
		const { autumnV2_4, ctx, pro, premium, laterPhaseStartsAt } =
			await setupPhaseProrationScenario({ customerId });
		const paramsWith = (prorationBehavior?: "prorate_immediately" | "none") =>
			proThenPremiumParams({
				customerId,
				laterPhaseStartsAt,
				proPlanId: pro.id,
				premiumPlanId: premium.id,
				prorationBehavior,
			});

		await autumnV2_4.billing.setPlans(paramsWith());
		const defaultPhase = await stripeSchedulePhaseStartingAt({
			ctx,
			customerId,
			startsAt: laterPhaseStartsAt,
		});
		expect(defaultPhase.proration_behavior).toBe("always_invoice");
		await expectScheduledPhaseProrationSaved({
			ctx,
			customerId,
			productId: premium.id,
			prorationBehavior: null,
		});

		await autumnV2_4.billing.setPlans(paramsWith("none"));
		const editedPhase = await stripeSchedulePhaseStartingAt({
			ctx,
			customerId,
			startsAt: laterPhaseStartsAt,
		});
		expect(editedPhase.proration_behavior).toBe("none");
		await expectScheduledPhaseProrationSaved({
			ctx,
			customerId,
			productId: premium.id,
			prorationBehavior: "none",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("phase proration: rejects a per-phase value on the first phase and bill_difference on a later one")}`,
	async () => {
		const customerId = "phase-proration-errors";
		const { autumnV2_4, pro, premium, laterPhaseStartsAt } =
			await setupPhaseProrationScenario({ customerId });
		const params = proThenPremiumParams({
			customerId,
			laterPhaseStartsAt,
			proPlanId: pro.id,
			premiumPlanId: premium.id,
		});
		const [firstPhase, laterPhase] = params.phases;

		await expectAutumnError({
			errMessage:
				"proration_behavior cannot be set on the first phase. Use the top-level proration_behavior instead.",
			func: () =>
				autumnV2_4.billing.setPlans({
					...params,
					phases: [{ ...firstPhase, proration_behavior: "none" }, laterPhase!],
				}),
		});

		await expectAutumnError({
			errMessage: "'bill_difference' is only supported on the immediate phase",
			func: () =>
				autumnV2_4.billing.setPlans({
					...params,
					phases: [
						firstPhase,
						{ ...laterPhase!, proration_behavior: "bill_difference" },
					],
				}),
		});
	},
);
