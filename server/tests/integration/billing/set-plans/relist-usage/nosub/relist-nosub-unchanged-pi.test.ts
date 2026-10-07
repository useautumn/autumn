/** set_plans re-lists Pro on no live Stripe sub, anchor unchanged, prorate_immediately: each change vs the unchanged re-list, pinned to Stripe. */

import { noSubState } from "../utils/relistStates";
import { defineRelistSuite } from "../utils/relistSuite";

defineRelistSuite({
	name: "nosub",
	stripeState: "no_sub",
	setupState: noSubState,
	anchor: "unchanged",
	proration: "prorate_immediately",
	changes: [
		"base_price",
		"usage_price",
		"prepaid_quantity",
		"swap",
		"drop",
		"add",
	],
});
