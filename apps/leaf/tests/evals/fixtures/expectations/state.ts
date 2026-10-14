import type { StateSubscriptionsExpectation } from "./types.js";

export const state = {
	subscriptions: ({
		customer,
		customerId,
		entities,
	}: {
		customer: string[];
		customerId: string;
		entities?: Record<string, string[]>;
	}): StateSubscriptionsExpectation => ({
		customer,
		customerId,
		...(entities ? { entities } : {}),
		type: "state.subscriptions",
	}),
};
