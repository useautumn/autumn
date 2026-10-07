/** set_plans re-lists an entity's Pro, with and without a live Stripe sub: same Stripe outcomes as the customer level. */

import { activeState, noSubState } from "../utils/relistStates";
import { defineRelistSuite } from "../utils/relistSuite";

for (const anchor of ["unchanged", "now"] as const) {
	defineRelistSuite({
		name: "ent-active",
		stripeState: "live",
		setupState: activeState,
		anchor,
		proration: "prorate_immediately",
		changes: ["usage_price"],
		entity: true,
	});
	defineRelistSuite({
		name: "ent-nosub",
		stripeState: "no_sub",
		setupState: noSubState,
		anchor,
		proration: "prorate_immediately",
		changes: ["usage_price"],
		entity: true,
	});
}
