import { test } from "bun:test";
import chalk from "chalk";
import { endTrialResettingNowAndExpect } from "./utils/trialEndUtils";

test.concurrent(
	`${chalk.yellowBright("set-plans trial end reset now: phase_start with none ends the trial and bills the full period now")}`,
	async () => {
		await endTrialResettingNowAndExpect({
			customerId: "set-plans-trial-reset-now-none",
			prorationBehavior: "none",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans trial end reset now: phase_start with default proration ends the trial and bills the full period now")}`,
	async () => {
		await endTrialResettingNowAndExpect({
			customerId: "set-plans-trial-reset-phase-start",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans trial end reset now: carry_over_usages carries the trial's usage into the new cycle")}`,
	async () => {
		await endTrialResettingNowAndExpect({
			customerId: "set-plans-trial-reset-carry",
			carriesUsage: true,
		});
	},
);
