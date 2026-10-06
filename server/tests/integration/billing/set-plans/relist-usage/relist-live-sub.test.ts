/**
 * set_plans re-lists a plan on a live Stripe sub with the anchor unchanged. Here Stripe itself treats a
 * kept and a swapped usage price differently (kept: carried to renewal; swapped: billed now at the old
 * price, or never under none), so each run is pinned to Stripe and the difference is Stripe's, not a bug.
 * Ground truth: handoffs/ATMN-746/stripe-relist-no-sub.md and handoffs/ATMN-729/stripe-usage-on-switch.md.
 */

import { expect, test } from "bun:test";
import chalk from "chalk";
import { expectedLiveKeptAnchorRelist } from "./utils/relistExpectations";
import {
	RELIST_SHAPES,
	type RelistProration,
	relistBilling,
	runRelistPair,
} from "./utils/relistScenario";

const PRORATIONS: RelistProration[] = [
	"prorate_immediately",
	"none",
	"bill_difference",
];

for (const proration of PRORATIONS) {
	test.concurrent(
		`${chalk.yellowBright(`relist live sub, anchor unchanged (${proration}): a kept price carries the usage to renewal and a changed price bills it per Stripe`)}`,
		async () => {
			const { unchanged, changed } = await runRelistPair({
				customerIdPrefix: `relist-live-${proration}`,
				start: "live_sub",
				proration,
				anchor: "unchanged",
			});
			console.log(JSON.stringify({ proration, unchanged, changed }, null, 2));

			expect({
				unchanged: relistBilling(unchanged.observation),
				changed: relistBilling(changed.observation),
			}).toEqual({
				unchanged: expectedLiveKeptAnchorRelist({
					shape: RELIST_SHAPES.pro,
					proration,
					priceChanged: false,
				}),
				changed: expectedLiveKeptAnchorRelist({
					shape: RELIST_SHAPES.pro,
					proration,
					priceChanged: true,
				}),
			});
		},
	);
}
