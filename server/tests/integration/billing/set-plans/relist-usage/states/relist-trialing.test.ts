/**
 * set_plans re-lists Pro while its Stripe sub is trialing. Stripe rejects a reset-now during a trial
 * (Autumn returns a clean 400), and a change with the anchor unchanged invoices nothing during the trial,
 * the same whether or not the usage price changes (Stripe probe: trial usage is rated at $0).
 */

import { expect, test } from "bun:test";
import { ErrCode } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import chalk from "chalk";
import { runRelistCase } from "../utils/relistMatrix";
import { trialingState } from "../utils/relistStates";
import { relistBilling } from "../utils/relistTypes";

const TRIAL_DAYS = 30;

for (const change of ["unchanged", "usage_price"] as const) {
	test.concurrent(
		`${chalk.yellowBright(`relist trialing, anchor now: ${change} is rejected with a 400 like Stripe`)}`,
		async () => {
			await expectAutumnError({
				errCode: ErrCode.InvalidRequest,
				errMessage:
					"The billing cycle can't reset now while the subscription's trial runs",
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
	`${chalk.yellowBright("relist trialing, anchor unchanged: unchanged and usage-price re-lists invoice nothing during the trial, identically")}`,
	async () => {
		const [unchanged, changed] = await Promise.all(
			(["unchanged", "usage_price"] as const).map((change) =>
				runRelistCase({
					customerId: `rl-trial-same-${change}`,
					setupState: trialingState,
					change,
					anchor: "unchanged",
					proration: "prorate_immediately",
					trialDays: TRIAL_DAYS,
					observeRenewal: false,
				}),
			),
		);
		expect(relistBilling(unchanged!.observation)).toMatchObject({
			executeTotal: 0,
			executeMessages: [],
		});
		expect(unchanged!.observation.preview.total).toBe(0);
		expect(unchanged!.observation.subscription?.status).toBe("trialing");
		expect(changed!.observation).toEqual(unchanged!.observation);
	},
);
