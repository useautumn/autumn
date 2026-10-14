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
