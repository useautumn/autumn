import { test } from "bun:test";
import {
	RELIST_PRORATIONS,
	type RelistAnchor,
	type RelistChange,
	runRelistCase,
} from "./utils/relistMatrix";
import { pastDueState } from "./utils/relistStates";

const ANCHOR: RelistAnchor = "now";
const CHANGES: RelistChange[] = ["unchanged", "usage_price"];

for (const proration of RELIST_PRORATIONS) {
	for (const change of CHANGES) {
		test.concurrent(
			`probe pastDueState ${ANCHOR} ${proration} ${change}`,
			async () => {
				const run = await runRelistCase({
					customerId: `probe-pastdue-${ANCHOR}-${proration}-${change}`.slice(
						0,
						60,
					),
					setupState: pastDueState,
					change,
					anchor: ANCHOR,
					proration,
				});
				console.log(
					`PROBE ${JSON.stringify({ state: "pastDueState", anchor: ANCHOR, proration, change, ...run })}`,
				);
			},
		);
	}
}
