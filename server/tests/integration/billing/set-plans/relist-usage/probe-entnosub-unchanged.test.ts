import { test } from "bun:test";
import {
	RELIST_PRORATIONS,
	type RelistAnchor,
	type RelistChange,
	runRelistCase,
} from "./utils/relistMatrix";
import { noSubState } from "./utils/relistStates";

const ANCHOR: RelistAnchor = "unchanged";
const CHANGES: RelistChange[] = ["unchanged", "usage_price", "swap"];

for (const proration of RELIST_PRORATIONS) {
	for (const change of CHANGES) {
		test.concurrent(
			`probe noSubState ${ANCHOR} ${proration} ${change}`,
			async () => {
				const run = await runRelistCase({
					customerId: `probe-entnosub-${ANCHOR}-${proration}-${change}`.slice(
						0,
						60,
					),
					setupState: noSubState,
					change,
					anchor: ANCHOR,
					proration,
					entity: true,
				});
				console.log(
					`PROBE ${JSON.stringify({ state: "noSubState", anchor: ANCHOR, proration, change, ...run })}`,
				);
			},
		);
	}
}
