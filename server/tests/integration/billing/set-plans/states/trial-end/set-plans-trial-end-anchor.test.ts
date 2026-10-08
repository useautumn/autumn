/**
 * Ending a live trial with a future billing_cycle_anchor recreates the subscription on the anchor: Stripe's update can't
 * anchor on a date and always invoices when a trial ends. none (the default) bills nothing until the anchor;
 * prorate_immediately and bill_difference bill the stub now.
 *
 * Red (before):  the trial ended in place, billing a full $940 now plus the anchor reset's prorated period.
 * Green (after): a new subscription anchored on the date bills as previewed, and balances reset there.
 */

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
