/** A saved anchor reset is a preview candidate only while the live Stripe schedule still restarts the cycle then. */

import { describe, expect, test } from "bun:test";
import type { BillingContext, FullCusProduct } from "@autumn/shared";
import type Stripe from "stripe";
import { pendingAnchorResets } from "@/internal/billing/v2/utils/billingPlan/toNextCyclePreview/getNextCycleEvent/pendingAnchorResets";

const nowMs = Date.UTC(2026, 9, 11);
const anchorMs = Date.UTC(2026, 9, 21);

const resettingOn = (resetsAt: number | null) =>
	({ billing_cycle_anchor_resets_at: resetsAt }) as FullCusProduct;

const contextWithResetPhases = (resetAts: number[] | null) =>
	({
		stripeSubscriptionSchedule:
			resetAts === null
				? undefined
				: ({
						phases: resetAts.map((resetAt) => ({
							start_date: resetAt / 1000,
							billing_cycle_anchor: "phase_start",
						})),
					} as unknown as Stripe.SubscriptionSchedule),
	}) as unknown as BillingContext;

describe("pendingAnchorResets", () => {
	test("keeps the future resets the live schedule confirms", () => {
		expect(
			pendingAnchorResets({
				billingContext: contextWithResetPhases([anchorMs, anchorMs + 1000]),
				customerProducts: [
					resettingOn(nowMs - 1000),
					resettingOn(null),
					resettingOn(anchorMs + 1000),
					resettingOn(anchorMs),
					resettingOn(anchorMs),
				],
				nowMs,
			}),
		).toEqual([anchorMs + 1000, anchorMs]);
	});

	test("ignores a saved reset the Stripe schedule no longer restarts the cycle at", () => {
		expect(
			pendingAnchorResets({
				billingContext: contextWithResetPhases(null),
				customerProducts: [resettingOn(anchorMs)],
				nowMs,
			}),
		).toEqual([]);
	});
});
