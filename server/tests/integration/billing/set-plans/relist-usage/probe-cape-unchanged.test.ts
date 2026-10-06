import { test } from "bun:test";
import {
	RELIST_PRORATIONS,
	type RelistAnchor,
	type RelistChange,
	runRelistCase,
} from "./utils/relistMatrix";
import { cancelAtPeriodEndState } from "./utils/relistStates";

const ANCHOR: RelistAnchor = "unchanged";
const CHANGES: RelistChange[] = ["unchanged", "usage_price", "swap", "drop"];

for (const proration of RELIST_PRORATIONS) {
	for (const change of CHANGES) {
		test.concurrent(
			`probe cancelAtPeriodEndState ${ANCHOR} ${proration} ${change}`,
			async () => {
				const run = await runRelistCase({
					customerId: `probe-cape-${ANCHOR}-${proration}-${change}`.slice(
						0,
						60,
					),
					setupState: cancelAtPeriodEndState,
					change,
					anchor: ANCHOR,
					proration,
				});
				console.log(
					`PROBE ${JSON.stringify({ state: "cancelAtPeriodEndState", anchor: ANCHOR, proration, change, ...run })}`,
				);
			},
		);
	}
}
