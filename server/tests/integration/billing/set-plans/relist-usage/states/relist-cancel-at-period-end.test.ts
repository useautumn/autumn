/** set_plans re-lists Pro set to cancel at period end: the cancellation stays, so the end bills only kept usage. */

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
