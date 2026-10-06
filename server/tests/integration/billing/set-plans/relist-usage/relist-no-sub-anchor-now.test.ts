/**
 * set_plans re-lists a plan with no live Stripe sub and resets the cycle now (billing_cycle_anchor
 * phase_start). With no sub, a reset changes nothing: the result must equal the unchanged-anchor re-list,
 * for both prices. Ground truth: handoffs/ATMN-746/stripe-relist-no-sub.md.
 */

import { expect, test } from "bun:test";
import chalk from "chalk";
import { expectedNoSubRelist } from "./utils/relistExpectations";
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
		`${chalk.yellowBright(`relist no sub, anchor now (${proration}): the unchanged and price-changed re-lists bill the old usage now and start the sub identically`)}`,
		async () => {
			const { unchanged, changed } = await runRelistPair({
				customerIdPrefix: `relist-nosub-now-${proration}`,
				start: "no_sub",
				proration,
				anchor: "phase_start",
			});
			console.log(JSON.stringify({ proration, unchanged, changed }, null, 2));

			expect(relistBilling(unchanged.observation)).toEqual(
				expectedNoSubRelist({ shape: RELIST_SHAPES.pro }),
			);
			expect(changed.observation).toEqual(unchanged.observation);
		},
	);
}

test.concurrent(
	`${chalk.yellowBright("relist no sub, entity plan: the unchanged and price-changed re-lists bill the entity's old usage now identically")}`,
	async () => {
		const { unchanged, changed } = await runRelistPair({
			customerIdPrefix: "relist-nosub-entity",
			start: "no_sub",
			proration: "prorate_immediately",
			anchor: "unchanged",
			entityLevel: true,
		});
		console.log(JSON.stringify({ unchanged, changed }, null, 2));

		expect(relistBilling(unchanged.observation)).toEqual(
			expectedNoSubRelist({ shape: RELIST_SHAPES.pro }),
		);
		expect(changed.observation).toEqual(unchanged.observation);
	},
);
