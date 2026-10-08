/**
 * Ending a live trial with no anchor anchors the cycle on the old trial end, through the same recreate.
 *
 * Red (before):  the trial ended in place, billing $940 now, with next cycle on the old trial end.
 * Green (after): $0 now under none, the stub under prorate/bill_difference or unset (attach's default), then $940 on the old trial end.
 * Balances refill when the trial ends unless carry_over_usages keeps its usage, then reset again on the anchor.
 */

import { test } from "bun:test";
import chalk from "chalk";
import { endTrialOnAnchorAndExpect, proratedStub } from "./utils/trialEndUtils";

test.concurrent(
	`${chalk.yellowBright("set-plans trial off, no anchor: unset proration prorates like attach, billing the stub to the old trial end now")}`,
	async () => {
		await endTrialOnAnchorAndExpect({
			customerId: "set-plans-trial-off-unset",
			anchorSource: "trial_end",
			expectedStub: proratedStub,
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
	`${chalk.yellowBright("set-plans trial off, no anchor: carry_over_usages keeps the trial's usage until the old trial end")}`,
	async () => {
		await endTrialOnAnchorAndExpect({
			customerId: "set-plans-trial-off-carry",
			anchorSource: "trial_end",
			carriesUsage: true,
			expectedStub: proratedStub,
		});
	},
);
