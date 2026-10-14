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
