/**
 * set_plans re-lists a plan on a live Stripe sub and resets the cycle now. Stripe closes the period
 * and bills its usage at the old price under every proration, identically for a kept and a swapped
 * price (Stripe g_* = sg_*). Ground truth: handoffs/ATMN-746/stripe-relist-no-sub.md.
 */

import { expect, test } from "bun:test";
import chalk from "chalk";
import { expectedLiveResetNowRelist } from "./utils/relistExpectations";
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
		`${chalk.yellowBright(`relist live sub, anchor now (${proration}): the unchanged and price-changed re-lists bill the closed period's usage at the old price identically`)}`,
		async () => {
			const { unchanged, changed } = await runRelistPair({
				customerIdPrefix: `relist-live-now-${proration}`,
				start: "live_sub",
				proration,
				anchor: "phase_start",
			});
			console.log(JSON.stringify({ proration, unchanged, changed }, null, 2));

			expect(relistBilling(unchanged.observation)).toEqual(
				expectedLiveResetNowRelist({
					shape: RELIST_SHAPES.pro,
					proration,
					clockStartMs: unchanged.clockStartMs,
				}),
			);
			expect(changed.observation).toEqual(unchanged.observation);
		},
	);
}
