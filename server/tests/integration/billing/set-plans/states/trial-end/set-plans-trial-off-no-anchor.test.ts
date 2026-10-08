/**
 * Ending a live trial with no anchor anchors the cycle on the old trial end, through the same recreate.
 *
 * Red (before):  the trial ended in place, billing $940 now, with next cycle on the old trial end.
 * Green (after): $0 now under none/unset, the stub under prorate/bill_difference, then $940 on the old trial end.
 */

import { test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import chalk from "chalk";
import {
	endTrialOnAnchorAndExpect,
	proratedStub,
	setupTrialingPlans,
} from "./utils/trialEndUtils";

test.concurrent(
	`${chalk.yellowBright("set-plans trial off, no anchor: unset proration defaults to none, billing nothing until the old trial end")}`,
	async () => {
		await endTrialOnAnchorAndExpect({
			customerId: "set-plans-trial-off-unset",
			anchorSource: "trial_end",
			expectedStub: () => 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans trial off, no anchor: none bills nothing until the old trial end")}`,
	async () => {
		await endTrialOnAnchorAndExpect({
			customerId: "set-plans-trial-off-none",
			anchorSource: "trial_end",
			prorationBehavior: "none",
			expectedStub: () => 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans trial off, no anchor: prorate_immediately bills the stub to the old trial end now")}`,
	async () => {
		await endTrialOnAnchorAndExpect({
			customerId: "set-plans-trial-off-prorate",
			anchorSource: "trial_end",
			prorationBehavior: "prorate_immediately",
			expectedStub: proratedStub,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans trial off, no anchor: bill_difference prorates the stub like prorate_immediately")}`,
	async () => {
		await endTrialOnAnchorAndExpect({
			customerId: "set-plans-trial-off-bill-diff",
			anchorSource: "trial_end",
			prorationBehavior: "bill_difference",
			expectedStub: proratedStub,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans trial off, no anchor: carry_over_usages is rejected, since nothing resets now")}`,
	async () => {
		const customerId = "set-plans-trial-off-carry";
		const { pro, addOn, autumnV2_4 } = await setupTrialingPlans({
			customerId,
		});

		await expectAutumnError({
			errCode: ErrCode.InvalidRequest,
			errMessage: "carry_over_usages is only supported",
			func: () =>
				autumnV2_4.billing.previewSetPlans({
					customer_id: customerId,
					free_trial: null,
					carry_over_usages: {
						enabled: true,
						feature_ids: [TestFeature.Messages],
					},
					phases: [
						{
							starts_at: "now",
							plans: [{ plan_id: pro.id }, { plan_id: addOn.id }],
						},
					],
				}),
		});
	},
);
