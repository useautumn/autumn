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
