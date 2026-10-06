/**
 * set_plans re-lists Pro after it was set to cancel at period end. Re-listing declares the plan continues,
 * so the cancel clears and Stripe bills it like a live sub (Stripe probe with cancel_at_period_end: false).
 */

import { expect } from "bun:test";
import { cancelAtPeriodEndState } from "../utils/relistStates";
import { defineRelistSuite } from "../utils/relistSuite";

for (const anchor of ["unchanged", "now"] as const) {
	defineRelistSuite({
		name: "cape",
		stripeState: "live",
		setupState: cancelAtPeriodEndState,
		anchor,
		proration: "prorate_immediately",
		changes: ["usage_price", "swap"],
		expectRun: (run) =>
			expect(run.observation.subscription?.cancelAtPeriodEnd).toBe(false),
	});
}
