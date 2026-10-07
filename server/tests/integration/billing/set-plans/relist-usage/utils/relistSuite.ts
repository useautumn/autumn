import { test } from "bun:test";
import chalk from "chalk";
import {
	type RelistRun,
	type RelistStateSetup,
	runRelistCase,
} from "./relistMatrix";
import {
	expectRelistMatchesStripe,
	expectRelistPairConsistent,
	type RelistExpectationOptions,
	type RelistStripeState,
} from "./relistStripeExpectations";
import type {
	RelistAnchor,
	RelistChange,
	RelistProration,
} from "./relistTypes";

const SHORT: Record<RelistProration, string> = {
	prorate_immediately: "pi",
	none: "none",
	bill_difference: "bd",
};

/** Each change is pinned to Stripe, and any Stripe bills like the unchanged baseline is compared to it field by field. */
export const defineRelistSuite = ({
	name,
	stripeState,
	setupState,
	anchor,
	proration,
	changes,
	entity,
	trialDays,
	otherRenewals,
	cancelsAtRenewal,
	expectRun,
	observeRenewal = anchor !== "custom",
}: {
	name: string;
	stripeState: RelistStripeState;
	setupState: RelistStateSetup;
	anchor: RelistAnchor;
	proration: RelistProration;
	changes: Exclude<RelistChange, "unchanged">[];
	entity?: boolean;
	trialDays?: number;
	otherRenewals?: number;
	cancelsAtRenewal?: boolean;
	expectRun?: (run: RelistRun) => void;
	observeRenewal?: boolean;
}) => {
	const options: RelistExpectationOptions = {
		renewalObserved: observeRenewal,
		otherRenewals,
		cancelsAtRenewal,
	};
	const run = (change: RelistChange) =>
		runRelistCase({
			customerId: `rl-${name}-${anchor}-${SHORT[proration]}-${change}`,
			setupState,
			change,
			anchor,
			proration,
			entity,
			trialDays,
			observeRenewal: options.renewalObserved,
		});
	let baseline: Promise<RelistRun> | undefined;
	const unchanged = () => {
		baseline ??= run("unchanged");
		return baseline;
	};
	const cell = { state: stripeState, anchor, proration, ...options };
	const label = `relist ${name}, anchor ${anchor}, ${proration}`;

	test.concurrent(
		`${chalk.yellowBright(`${label}: unchanged re-list matches Stripe`)}`,
		async () => {
			const same = await unchanged();
			expectRelistMatchesStripe({ ...cell, change: "unchanged", run: same });
			expectRun?.(same);
		},
	);

	for (const change of changes) {
		test.concurrent(
			`${chalk.yellowBright(`${label}: ${change} matches Stripe and is consistent with the unchanged re-list`)}`,
			async () => {
				const [changed, same] = await Promise.all([run(change), unchanged()]);
				expectRelistPairConsistent({
					...cell,
					change,
					unchanged: same,
					changed,
				});
				expectRelistMatchesStripe({ ...cell, change, run: changed });
				expectRun?.(changed);
			},
		);
	}
};
