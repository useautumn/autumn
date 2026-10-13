/**
 * Backdating a trialing subscription with the trial turned off recreates it as an active subscription from the
 * backdated start, anchored on the requested anchor or else the old trial end, like Stripe's create with
 * backdate_start_date + billing_cycle_anchor: prorate_immediately and bill_difference bill the backdated window now
 * (a stub to the first anchored boundary, then each month in full), none bills nothing until the anchor.
 *
 * Red (before):  400 "A trial can't be backdated to".
 * Green (after): preview == execute == Stripe's invoice; the row stays Active on the new subscription.
 */

import { test } from "bun:test";
import chalk from "chalk";
import type { BackdateProrationBehavior } from "../backdate-live/utils/backdateLiveUtils";
import {
	type BackdateTrialAnchor,
	backdateTrialingAndExpect,
} from "./utils/backdateTrialingUtils";

const PRORATION_BEHAVIORS = [
	"none",
	"prorate_immediately",
	"bill_difference",
] as const satisfies BackdateProrationBehavior[];

for (const anchor of [
	"unset",
	"custom",
] as const satisfies BackdateTrialAnchor[]) {
	for (const prorationBehavior of PRORATION_BEHAVIORS) {
		test.concurrent(
			`${chalk.yellowBright(`set-plans backdate trialing: trial off, ${anchor} anchor, ${prorationBehavior}`)}`,
			async () => {
				await backdateTrialingAndExpect({
					customerId: `sp-bd-trial-off-${anchor}-${prorationBehavior}`,
					keepsTrial: false,
					anchor,
					prorationBehavior,
				});
			},
		);
	}
}
