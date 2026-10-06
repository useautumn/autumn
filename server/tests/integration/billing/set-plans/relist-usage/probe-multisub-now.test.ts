import { test } from "bun:test";
import {
	RELIST_PRORATIONS,
	type RelistAnchor,
	type RelistChange,
	runRelistCase,
} from "./utils/relistMatrix";
import { multiSubState } from "./utils/relistStates";

const ANCHOR: RelistAnchor = "now";
const CHANGES: RelistChange[] = ["unchanged", "usage_price", "drop"];

for (const proration of RELIST_PRORATIONS) {
	for (const change of CHANGES) {
		test.concurrent(
			`probe multiSubState ${ANCHOR} ${proration} ${change}`,
			async () => {
				const run = await runRelistCase({
					customerId: `probe-multisub-${ANCHOR}-${proration}-${change}`.slice(
						0,
						60,
					),
					setupState: multiSubState,
					change,
					anchor: ANCHOR,
					proration,
				});
				console.log(
					`PROBE ${JSON.stringify({ state: "multiSubState", anchor: ANCHOR, proration, change, ...run })}`,
				);
			},
		);
	}
}
