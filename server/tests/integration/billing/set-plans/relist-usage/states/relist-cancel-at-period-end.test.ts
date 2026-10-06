/**
 * set_plans re-lists Pro after it was set to cancel at period end. A re-list keeps the cancellation
 * (set-plans-cancel-at.test.ts), so Stripe bills the change like a live sub and ends it with only the kept usage.
 */

import { cancelAtPeriodEndState } from "../utils/relistStates";
import { defineRelistSuite } from "../utils/relistSuite";

for (const anchor of ["unchanged", "now"] as const) {
	defineRelistSuite({
		name: "cape",
		stripeState: "live",
		setupState: cancelAtPeriodEndState,
		anchor,
		proration: "prorate_immediately",
		changes: ["usage_price"],
		cancelsAtRenewal: true,
	});
}
