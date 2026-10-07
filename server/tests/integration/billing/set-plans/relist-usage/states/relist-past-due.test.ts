/** set_plans re-lists Pro while its renewal payment failed (past_due): Stripe still applies the change. */

import { pastDueState } from "../utils/relistStates";
import { defineRelistSuite } from "../utils/relistSuite";

for (const anchor of ["unchanged", "now"] as const) {
	defineRelistSuite({
		name: "pastdue",
		stripeState: "live",
		setupState: pastDueState,
		anchor,
		proration: "prorate_immediately",
		changes: ["usage_price"],
		observeRenewal: false,
	});
}
