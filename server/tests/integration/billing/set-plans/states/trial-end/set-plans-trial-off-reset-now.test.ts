/**
 * Ending a live trial with a reset now (phase_start starting now) runs the reset-now path, as Stripe's trial_end now
 * plus billing_cycle_anchor now: the full period is billed now under every proration, usage resets unless carried.
 *
 * Red (before):  trialing_cycle_reset 400.
 * Green (after): $940 now and on the renewal, balances reset (or carried with carry_over_usages).
 */

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
