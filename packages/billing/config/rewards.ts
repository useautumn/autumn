import { coupon } from "atmn";

export const rewards = [
	coupon({
		id: "small_teams",
		name: "Small Teams",
		duration: {
			type: "months",
			length: 12,
		},
		planIds: null,
		promoCodes: [],
		internalId: "rew_3JvRcI4jGdCK9GKGAYKInVJyrf5",
		type: "percentage_discount",
		value: 20,
	}),
	coupon({
		id: "yc_30_off",
		name: "YC 30% OFF",
		duration: {
			type: "months",
			length: 3,
		},
		planIds: null,
		promoCodes: [],
		internalId: "rew_3JvRcHKw0fHUOWo1magyRAPMb30",
		type: "percentage_discount",
		value: 20,
	}),
	coupon({
		id: "month-off",
		name: "Month Off",
		duration: {
			type: "months",
			length: 1,
		},
		planIds: null,
		promoCodes: [],
		internalId: "rew_3JvRcOFqL6QAXlDOhFX9VbvzHZC",
		type: "percentage_discount",
		value: 100,
	}),
];
export const referralPrograms = [];
