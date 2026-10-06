/**
 * set_plans re-lists Pro while its Stripe sub is trialing. Stripe rejects a reset-now during a trial, so
 * Autumn returns a clean 400. With the anchor unchanged, Stripe invoices nothing during the trial and
 * rates trial usage at $0, so the trial end bills only the plan, whether or not the usage price changed.
 */

import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import chalk from "chalk";
import { runRelistCase } from "../utils/relistMatrix";
import { trialingState } from "../utils/relistStates";
import { RELIST, relistBilling } from "../utils/relistTypes";

const TRIAL_DAYS = 30;

for (const change of ["unchanged", "usage_price"] as const) {
	test.concurrent(
		`${chalk.yellowBright(`relist trialing, anchor now: ${change} is rejected with a 400 like Stripe`)}`,
		async () => {
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				func: () =>
					runRelistCase({
						customerId: `rl-trial-now-${change}`,
						setupState: trialingState,
						change,
						anchor: "now",
						proration: "prorate_immediately",
						trialDays: TRIAL_DAYS,
					}),
			});
		},
	);
}

test.concurrent(
	`${chalk.yellowBright("relist trialing, anchor unchanged: unchanged and usage-price re-lists bill nothing in the trial and only the plan at its end")}`,
	async () => {
		const runs = await Promise.all(
			(["unchanged", "usage_price"] as const).map((change) =>
				runRelistCase({
					customerId: `rl-trial-same-${change}`,
					setupState: trialingState,
					change,
					anchor: "unchanged",
					proration: "prorate_immediately",
					trialDays: TRIAL_DAYS,
				}),
			),
		);
		for (const { observation } of runs) {
			const { executeTotal, executeMessages, renewalTotal, renewalMessages } =
				relistBilling(observation);
			expect({
				previewTotal: observation.preview.total,
				status: observation.subscription?.status,
				executeTotal,
				executeMessages,
				renewalTotal,
				renewalMessages,
			}).toEqual({
				previewTotal: 0,
				status: "trialing",
				executeTotal: 0,
				executeMessages: [],
				renewalTotal: RELIST.proPrice + RELIST.wordsPackPrice,
				renewalMessages: [],
			});
		}
	},
);
