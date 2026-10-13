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
		internalId: "rew_3Is9O64fOJPrIs1ubMUIbNTztpp",
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
		internalId: "rew_2yQBEwSbtIDWGaD7m4MrE2bTE55",
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
		internalId: "rew_2viLne5ANcIWgyEwJO5eK8eGa33",
		type: "percentage_discount",
		value: 100,
	}),
];
export const referralPrograms = [];
