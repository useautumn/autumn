import { activeState } from "../utils/relistStates";
import { defineRelistSuite } from "../utils/relistSuite";

defineRelistSuite({
	name: "active",
	stripeState: "live",
	setupState: activeState,
	anchor: "unchanged",
	proration: "bill_difference",
	changes: [
		"base_price",
		"usage_price",
		"prepaid_quantity",
		"swap",
		"drop",
		"add",
	],
});
