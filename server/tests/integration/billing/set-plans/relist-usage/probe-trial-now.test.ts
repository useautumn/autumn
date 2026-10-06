import { test } from "bun:test";
import {
	RELIST_PRORATIONS,
	type RelistAnchor,
	type RelistChange,
	runRelistCase,
} from "./utils/relistMatrix";
import { trialingState } from "./utils/relistStates";

const ANCHOR: RelistAnchor = "now";
const CHANGES: RelistChange[] = [
	"unchanged",
	"usage_price",
	"base_price",
	"swap",
];

for (const proration of RELIST_PRORATIONS) {
	for (const change of CHANGES) {
		test.concurrent(
			`probe trialingState ${ANCHOR} ${proration} ${change}`,
			async () => {
				const run = await runRelistCase({
					customerId: `probe-trial-${ANCHOR}-${proration}-${change}`.slice(
						0,
						60,
					),
					setupState: trialingState,
					change,
					anchor: ANCHOR,
					proration,
					trialDays: 30,
				});
				console.log(
					`PROBE ${JSON.stringify({ state: "trialingState", anchor: ANCHOR, proration, change, ...run })}`,
				);
			},
		);
	}
}
