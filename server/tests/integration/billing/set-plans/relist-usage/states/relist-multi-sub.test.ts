import { multiSubState } from "../utils/relistStates";
import { defineRelistSuite } from "../utils/relistSuite";
import { RELIST } from "../utils/relistTypes";

for (const anchor of ["unchanged", "now"] as const) {
	defineRelistSuite({
		name: "multisub",
		stripeState: "live",
		setupState: multiSubState,
		anchor,
		proration: "prorate_immediately",
		changes: ["usage_price"],
		otherRenewals: RELIST.addOnPrice,
	});
}
