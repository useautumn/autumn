/** set_plans re-lists Pro on no live Stripe sub (option 1), anchor custom, none: each change vs the unchanged re-list, pinned to Stripe. */

import { noSubState } from "../utils/relistStates";
import { defineRelistSuite } from "../utils/relistSuite";

defineRelistSuite({
	name: "nosub",
	stripeState: "no_sub",
	setupState: noSubState,
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
