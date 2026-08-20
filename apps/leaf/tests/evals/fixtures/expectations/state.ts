import type { StateSubscriptionsExpectation } from "./types.js";

export const state = {
	/** Assert the world the writes leave behind rather than the calls that made
	 * it — robust to how the model orders or batches them. */
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
