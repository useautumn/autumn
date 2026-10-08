/**
 * A backdated trialing recreate that keeps its trial can anchor the cycle after the trial ends, as Stripe's create
 * takes trial_end + billing_cycle_anchor: $0 now, a prorated stub from the trial end to the anchor, then the full
 * period. Stripe requires that stub to be prorated and the anchor to be on or after the trial end, so proration none
 * and an earlier anchor are rejected before anything is written.
 *
 * Red (before):  400 "A trial can't be backdated to".
 * Green (after): the prorate case bills like Stripe; the none and early-anchor cases return actionable 400s.
 */

import { expect, test } from "bun:test";
import { ms, type SetPlansParamsV0Input } from "@autumn/shared";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import chalk from "chalk";
import {
	backdatedStartMs,
	backdateTrialingAndExpect,
	initTrialingProScenario,
} from "./utils/backdateTrialingUtils";

test.concurrent(
	`${chalk.yellowBright("set-plans backdate trialing: trial kept, custom anchor after the trial end, prorate_immediately bills the stub at the trial end")}`,
	async () => {
		await backdateTrialingAndExpect({
			customerId: "sp-bd-trial-kept-anchor-prorate",
			keepsTrial: true,
			anchor: "custom",
			prorationBehavior: "prorate_immediately",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set-plans backdate trialing: trial kept, custom anchor rejects none and an anchor before the trial end")}`,
	async () => {
		const customerId = "sp-bd-trial-kept-anchor-errors";
		const { autumnV2_4, ctx, proTrial, trialing, trialEndMs, nowMs } =
			await initTrialingProScenario({ customerId });
		const paramsWith = ({
			anchorMs,
			prorationBehavior,
		}: {
			anchorMs: number;
			prorationBehavior: "none" | "prorate_immediately";
		}): SetPlansParamsV0Input => ({
			customer_id: customerId,
			phases: [
				{
					starts_at: backdatedStartMs({ nowMs }),
					billing_cycle_anchor: anchorMs,
					proration_behavior: prorationBehavior,
					plans: [{ plan_id: proTrial.id }],
				},
			],
		});

		await expectAutumnError({
			errMessage: "proration_behavior can't be none here",
			func: () =>
				autumnV2_4.billing.setPlans(
					paramsWith({
						anchorMs: trialEndMs + ms.days(6),
						prorationBehavior: "none",
					}),
				),
		});
		await expectAutumnError({
			errMessage: "billing_cycle_anchor is before the kept trial ends",
			func: () =>
				autumnV2_4.billing.setPlans(
					paramsWith({
						anchorMs: trialEndMs - ms.days(2),
						prorationBehavior: "prorate_immediately",
					}),
				),
		});
		expect(
			(await ctx.stripeCli.subscriptions.retrieve(trialing.id)).status,
		).toBe("trialing");
	},
);
