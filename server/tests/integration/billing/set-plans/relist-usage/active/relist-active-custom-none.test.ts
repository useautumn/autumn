/** set_plans re-lists Pro on a live Stripe sub, anchor custom, none: each change vs the unchanged re-list, pinned to Stripe. */

import { activeState } from "../utils/relistStates";
import { defineRelistSuite } from "../utils/relistSuite";

defineRelistSuite({
	name: "active",
	stripeState: "live",
	setupState: activeState,
	anchor: "custom",
	proration: "none",
	changes: [
		"base_price",
		"usage_price",
		"prepaid_quantity",
		"swap",
		"drop",
		"add",
	],
});
