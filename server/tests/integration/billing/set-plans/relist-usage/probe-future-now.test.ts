import { test } from "bun:test";
import {
	RELIST_PRORATIONS,
	type RelistAnchor,
	type RelistChange,
	runRelistCase,
} from "./utils/relistMatrix";
import { futurePhaseState } from "./utils/relistStates";

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
			`probe futurePhaseState ${ANCHOR} ${proration} ${change}`,
			async () => {
				const run = await runRelistCase({
					customerId: `probe-future-${ANCHOR}-${proration}-${change}`.slice(
						0,
						60,
					),
					setupState: futurePhaseState,
					change,
					anchor: ANCHOR,
					proration,
				});
				console.log(
					`PROBE ${JSON.stringify({ state: "futurePhaseState", anchor: ANCHOR, proration, change, ...run })}`,
				);
			},
		);
	}
}
