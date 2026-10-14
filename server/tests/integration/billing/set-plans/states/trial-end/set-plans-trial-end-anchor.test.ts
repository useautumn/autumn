import { test } from "bun:test";
import chalk from "chalk";
import { endTrialOnAnchorAndExpect, proratedStub } from "./utils/trialEndUtils";

test.concurrent(
	`${chalk.yellowBright("set-plans trial end anchor: unset proration defaults to none, billing nothing until the anchor")}`,
	async () => {
		await endTrialOnAnchorAndExpect({
			customerId: "set-plans-trial-anchor-unset",
			anchorSource: "requested",
			expectedStub: () => 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans trial end anchor: none bills nothing until the anchor")}`,
	async () => {
		await endTrialOnAnchorAndExpect({
			customerId: "set-plans-trial-anchor-none",
			anchorSource: "requested",
			prorationBehavior: "none",
			expectedStub: () => 0,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans trial end anchor: prorate_immediately bills the stub to the anchor now")}`,
	async () => {
		await endTrialOnAnchorAndExpect({
			customerId: "set-plans-trial-anchor-prorate",
			anchorSource: "requested",
			prorationBehavior: "prorate_immediately",
			expectedStub: proratedStub,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans trial end anchor: bill_difference prorates the stub like prorate_immediately")}`,
	async () => {
		await endTrialOnAnchorAndExpect({
			customerId: "set-plans-trial-anchor-bill-diff",
			anchorSource: "requested",
			prorationBehavior: "bill_difference",
			expectedStub: proratedStub,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans trial end anchor: carry_over_usages keeps the trial's usage until the anchor")}`,
	async () => {
		await endTrialOnAnchorAndExpect({
			customerId: "set-plans-trial-anchor-carry",
			anchorSource: "requested",
			carriesUsage: true,
			expectedStub: () => 0,
		});
	},
);
