/**
 * A later phase's proration_behavior decides what preview_set_plans shows as next_cycle,
 * exactly as it decides the Stripe phase's proration.
 *
 * Red (before):   reset + prorate_immediately previewed $50; Stripe's next invoice is
 *                 $50 minus the unused Pro credit. Kept anchor + none previewed a prorated
 *                 charge at the phase start; Stripe bills nothing until the renewal.
 * Green (after):  next_cycle equals Stripe's upcoming invoice for the schedule in all four
 *                 anchor × proration combinations.
 */

import { test } from "bun:test";
import type { PhaseProrationBehavior } from "@autumn/shared";
import chalk from "chalk";
import {
	expectPreviewMatchesStripeUpcomingInvoice,
	setupPhaseProrationScenario,
	twoPhaseParams,
} from "./utils/phaseProrationUtils";

const expectUpgradePreviewMatchesStripe = async ({
	customerId,
	billingCycleAnchor,
	prorationBehavior,
}: {
	customerId: string;
	billingCycleAnchor?: "phase_start";
	prorationBehavior: PhaseProrationBehavior;
}) => {
	const { autumnV2_4, ctx, pro, premium, laterPhaseStartsAt } =
		await setupPhaseProrationScenario({ customerId, proAlreadyActive: true });
	const params = twoPhaseParams({
		customerId,
		laterPhaseStartsAt,
		openingPlanIds: [pro.id],
		laterPlanIds: [premium.id],
		billingCycleAnchor,
		prorationBehavior,
	});

	const preview = await autumnV2_4.billing.previewSetPlans(params);
	await autumnV2_4.billing.setPlans(params);

	await expectPreviewMatchesStripeUpcomingInvoice({
		ctx,
		customerId,
		nextCycle: preview.next_cycle,
	});
};

test.concurrent(
	`${chalk.yellowBright("phase proration next cycle: a reset with prorate_immediately previews the new plan minus the old plan's unused time")}`,
	async () => {
		await expectUpgradePreviewMatchesStripe({
			customerId: "phase-next-cycle-reset-prorated",
			billingCycleAnchor: "phase_start",
			prorationBehavior: "prorate_immediately",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("phase proration next cycle: a reset with none previews the new plan's full cycle")}`,
	async () => {
		await expectUpgradePreviewMatchesStripe({
			customerId: "phase-next-cycle-reset-none",
			billingCycleAnchor: "phase_start",
			prorationBehavior: "none",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("phase proration next cycle: a kept anchor with prorate_immediately previews the prorated difference at the phase start")}`,
	async () => {
		await expectUpgradePreviewMatchesStripe({
			customerId: "phase-next-cycle-kept-prorated",
			prorationBehavior: "prorate_immediately",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("phase proration next cycle: a kept anchor with none previews the renewal, since the phase start bills nothing")}`,
	async () => {
		await expectUpgradePreviewMatchesStripe({
			customerId: "phase-next-cycle-kept-none",
			prorationBehavior: "none",
		});
	},
);
