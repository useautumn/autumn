import { baseSubscription } from "../base/baseSubscription.js";

type SubscriptionArgs = Omit<Parameters<typeof baseSubscription>[0], "status">;

export const subscriptions = {
	active: (args: SubscriptionArgs) =>
		baseSubscription({ ...args, status: "active" }),
	scheduled: (args: SubscriptionArgs) =>
		baseSubscription({ ...args, status: "scheduled" }),
} as const;
