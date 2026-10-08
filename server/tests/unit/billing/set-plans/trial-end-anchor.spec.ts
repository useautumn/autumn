/**
 * Turning a live trial off anchors the new cycle on the old trial end, but only for a first phase starting now or
 * backdated, and never as the requested anchor: request guards judge only what the caller sent.
 *
 * Red (before):  a future first phase with free_trial null wrote the old trial end into the requested anchor,
 *                so set_plans rejected it with future_start_conflict billing_cycle_anchor, and an ends_at before
 *                the trial end failed date_order.
 * Green (after): the trial end is its own field, set only when the phase starts now or was backdated.
 */

import { describe, expect, test } from "bun:test";
import {
	type CreateScheduleBillingContext,
	ms,
	msToSeconds,
	type SetPlansParamsV0,
} from "@autumn/shared";
import chalk from "chalk";
import type Stripe from "stripe";
import { handleSetPlansBillingCycleAnchorErrors } from "@/internal/billing/v2/actions/setPlans/errors/handleSetPlansBillingCycleAnchorErrors";
import {
	immediatePhaseBillingCycleAnchor,
	setupTrialEndAnchorMs,
} from "@/internal/billing/v2/actions/setPlans/utils/immediatePhaseBilling";

const NOW = Date.UTC(2026, 9, 8, 12);
const TRIAL_END = NOW + ms.days(14);

const trialingSubscription = {
	id: "sub_trial",
	status: "trialing",
	trial_end: msToSeconds(TRIAL_END),
} as Stripe.Subscription;

const trialOffContext = {
	currentEpochMs: NOW,
	stripeSubscription: trialingSubscription,
	trialContext: {
		trialEndsAt: null,
		appliesToBilling: true,
		cardRequired: true,
	},
};

const paramsStarting = (
	startsAt: number | "now",
): Pick<SetPlansParamsV0, "phases"> =>
	({
		phases: [{ starts_at: startsAt, plans: [] }],
	}) as unknown as Pick<SetPlansParamsV0, "phases">;

describe(chalk.yellowBright("set_plans trial-end anchor"), () => {
	test("a future first phase with free_trial null takes no anchor", () => {
		const params = paramsStarting(NOW + ms.days(5));
		expect({
			requested: immediatePhaseBillingCycleAnchor({
				params,
				currentEpochMs: NOW,
			}),
			trialEnd: setupTrialEndAnchorMs({
				params,
				billingContext: trialOffContext,
			}),
		}).toEqual({ requested: undefined, trialEnd: undefined });
	});

	test("a first phase starting now or backdated anchors on the old trial end, outside the requested anchor", () => {
		for (const startsAt of ["now", NOW - ms.days(40)] as const) {
			const params = paramsStarting(startsAt);
			expect({
				requested: immediatePhaseBillingCycleAnchor({
					params,
					currentEpochMs: NOW,
				}),
				trialEnd: setupTrialEndAnchorMs({
					params,
					billingContext: trialOffContext,
				}),
			}).toEqual({ requested: undefined, trialEnd: TRIAL_END });
		}
	});

	test("an ends_at before the old trial end isn't judged against a derived anchor", () => {
		expect(() =>
			handleSetPlansBillingCycleAnchorErrors({
				billingContext: {
					...trialOffContext,
					requestedBillingCycleAnchor: undefined,
					trialEndAnchorMs: TRIAL_END,
					fullProducts: [],
					futurePhases: [],
				} as unknown as CreateScheduleBillingContext,
				endsAt: NOW + ms.days(7),
			}),
		).not.toThrow();
	});
});
