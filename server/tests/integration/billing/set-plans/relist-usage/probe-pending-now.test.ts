import { test } from "bun:test";
import {
	RELIST_PRORATIONS,
	type RelistAnchor,
	type RelistChange,
	runRelistCase,
} from "./utils/relistMatrix";
import { pendingAnchorState } from "./utils/relistStates";

const ANCHOR: RelistAnchor = "now";
const CHANGES: RelistChange[] = ["unchanged", "usage_price", "base_price"];

for (const proration of RELIST_PRORATIONS) {
	for (const change of CHANGES) {
		test.concurrent(
			`probe pendingAnchorState ${ANCHOR} ${proration} ${change}`,
			async () => {
				const run = await runRelistCase({
					customerId: `probe-pending-${ANCHOR}-${proration}-${change}`.slice(
						0,
						60,
					),
					setupState: pendingAnchorState,
					change,
					anchor: ANCHOR,
					proration,
				});
				console.log(
					`PROBE ${JSON.stringify({ state: "pendingAnchorState", anchor: ANCHOR, proration, change, ...run })}`,
				);
			},
		);
	}
}
