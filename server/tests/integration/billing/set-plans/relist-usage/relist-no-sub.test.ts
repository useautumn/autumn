/**
 * set_plans re-lists a plan that is active in Autumn with no live Stripe sub (usage accrued, never billed).
 * Option 1 (Charlie): bill the usage now at the price it was used at, start the sub, reset usage, and do
 * exactly the same whether or not the price changes. Ground truth: handoffs/ATMN-746/stripe-relist-no-sub.md.
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
		`${chalk.yellowBright(`relist no sub (${proration}): the unchanged and price-changed re-lists bill the old usage now, start the sub and reset usage identically`)}`,
		async () => {
			const { unchanged, changed } = await runRelistPair({
				customerIdPrefix: `relist-nosub-${proration}`,
				start: "no_sub",
				proration,
				anchor: "unchanged",
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
	`${chalk.yellowBright("relist no sub (prod shape, usage-only plan): the unchanged and price-changed re-lists bill the old usage now identically")}`,
	async () => {
		const { unchanged, changed } = await runRelistPair({
			customerIdPrefix: "relist-nosub-usage-only",
			start: "no_sub",
			proration: "prorate_immediately",
			anchor: "unchanged",
			shape: RELIST_SHAPES.usageOnly,
		});
		console.log(JSON.stringify({ unchanged, changed }, null, 2));

		expect(relistBilling(unchanged.observation)).toEqual(
			expectedNoSubRelist({ shape: RELIST_SHAPES.usageOnly }),
		);
		expect(changed.observation).toEqual(unchanged.observation);
	},
);
