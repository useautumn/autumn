/**
 * phase_start on a backdated phase anchors on the backdated start, as every other backdate does, also when it ends a
 * trial: Stripe's backdate with no anchor bills each cycle from the start through the one running now under
 * prorate_immediately and bill_difference, and drops them all under none.
 *
 * Red (before):  400 "A trial can't be backdated to".
 * Green (after): preview == execute == Stripe's invoice; the next renewal is the backdated start's next boundary.
 */

import { test } from "bun:test";
import chalk from "chalk";
import type { BackdateProrationBehavior } from "../backdate-live/utils/backdateLiveUtils";
import { backdateTrialingAndExpect } from "./utils/backdateTrialingUtils";

for (const prorationBehavior of [
	"none",
	"prorate_immediately",
	"bill_difference",
] as const satisfies BackdateProrationBehavior[]) {
	test.concurrent(
		`${chalk.yellowBright(`set-plans backdate trialing: trial off, phase_start anchors on the backdated start, ${prorationBehavior}`)}`,
		async () => {
			await backdateTrialingAndExpect({
				customerId: `sp-bd-trial-off-phase-start-${prorationBehavior}`,
				keepsTrial: false,
				anchor: "phase_start",
				prorationBehavior,
			});
		},
	);
}
