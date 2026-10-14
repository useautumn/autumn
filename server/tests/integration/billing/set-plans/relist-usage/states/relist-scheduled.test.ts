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
