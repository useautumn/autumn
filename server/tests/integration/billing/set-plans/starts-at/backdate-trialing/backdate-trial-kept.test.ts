/**
 * Backdating a trialing subscription that keeps its trial recreates it trialing from the backdated start to the
 * original trial end: Stripe stretches the trial back, so nothing is billed now under any proration, and the trial end
 * bills the full period. Usage isn't reset, since the trial doesn't end.
 *
 * Red (before):  400 "A trial can't be backdated to".
 * Green (after): $0 preview and invoice; the row stays Active and trialing on the new subscription.
 */

import { test } from "bun:test";
import chalk from "chalk";
import type { BackdateProrationBehavior } from "../backdate-live/utils/backdateLiveUtils";
import { backdateTrialingAndExpect } from "./utils/backdateTrialingUtils";

for (const prorationBehavior of [
	"none",
	"prorate_immediately",
] as const satisfies BackdateProrationBehavior[]) {
	test.concurrent(
		`${chalk.yellowBright(`set-plans backdate trialing: trial kept, ${prorationBehavior} bills nothing until the trial end`)}`,
		async () => {
			await backdateTrialingAndExpect({
				customerId: `sp-bd-trial-kept-${prorationBehavior}`,
				keepsTrial: true,
				anchor: "unset",
				prorationBehavior,
			});
		},
	);
}
