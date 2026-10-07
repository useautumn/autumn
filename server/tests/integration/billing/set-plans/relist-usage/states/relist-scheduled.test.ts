/** set_plans re-lists Pro with a future phase or anchor reset pending: Stripe bills it like the same live sub. */

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
