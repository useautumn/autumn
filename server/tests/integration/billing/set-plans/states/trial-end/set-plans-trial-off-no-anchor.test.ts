import { test } from "bun:test";
import chalk from "chalk";
import { endTrialOnAnchorAndExpect, proratedStub } from "./utils/trialEndUtils";

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
	`${chalk.yellowBright("set-plans trial off, no anchor: carry_over_usages keeps the trial's usage until the old trial end")}`,
	async () => {
		await endTrialOnAnchorAndExpect({
			customerId: "set-plans-trial-off-carry",
			anchorSource: "trial_end",
			carriesUsage: true,
			expectedStub: () => 0,
		});
	},
);
