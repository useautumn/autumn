/**
 * set_plans re-lists Pro while a schedule is pending: a future phase (Pro at $30 from renewal), or a
 * pending anchor reset. The request is the full declaration, so Stripe bills it like the same live sub.
 */

import { futurePhaseState, pendingAnchorState } from "../utils/relistStates";
import { defineRelistSuite } from "../utils/relistSuite";

for (const anchor of ["unchanged", "now"] as const) {
	defineRelistSuite({
		name: "future",
		stripeState: "live",
		setupState: futurePhaseState,
		anchor,
		proration: "prorate_immediately",
		changes: ["usage_price"],
	});
}

defineRelistSuite({
	name: "pending",
	stripeState: "live",
	setupState: pendingAnchorState,
	anchor: "now",
	proration: "prorate_immediately",
	changes: ["usage_price"],
});
