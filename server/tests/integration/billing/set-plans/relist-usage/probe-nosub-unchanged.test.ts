import { test } from "bun:test";
import {
	RELIST_PRORATIONS,
	type RelistAnchor,
	type RelistChange,
	runRelistCase,
} from "./utils/relistMatrix";
import { noSubState } from "./utils/relistStates";

const ANCHOR: RelistAnchor = "unchanged";
const CHANGES: RelistChange[] = [
	"unchanged",
	"base_price",
	"usage_price",
	"prepaid_quantity",
	"swap",
	"drop",
	"add",
];

for (const proration of RELIST_PRORATIONS) {
	for (const change of CHANGES) {
		test.concurrent(
			`probe noSubState ${ANCHOR} ${proration} ${change}`,
			async () => {
				const run = await runRelistCase({
					customerId: `probe-nosub-${ANCHOR}-${proration}-${change}`.slice(
						0,
						60,
					),
					setupState: noSubState,
					change,
					anchor: ANCHOR,
					proration,
				});
				console.log(
					`PROBE ${JSON.stringify({ state: "noSubState", anchor: ANCHOR, proration, change, ...run })}`,
				);
			},
		);
	}
}
