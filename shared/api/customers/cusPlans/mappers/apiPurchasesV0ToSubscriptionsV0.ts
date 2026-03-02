import type { SharedContext } from "../../../../types/sharedContext";
import type { ApiSubscription } from "../apiSubscription";
import type { ApiPurchaseV0 } from "../apiSubscriptionV1";
import { mergeSubscriptionResponses } from "./apiSubscriptionsV1ToV0";
import { apiSubscriptionV1ToV0 } from "./apiSubscriptionV1ToV0";

export const apiPurchasesV0ToSubscriptionsV0 = ({
	ctx,
	purchases,
}: {
	ctx: SharedContext;
	purchases: ApiPurchaseV0[];
}): ApiSubscription[] => {
	// Merge purchases as subscriptions
	const mergedPurchases = mergeSubscriptionResponses({
		subscriptions: purchases.map((purchase) => ({
			...purchase,
			id: purchase.plan_id,
			auto_enable: false,
			add_on: true,
			status: "active" as const,
			past_due: false,
			canceled_at: null,
			trial_ends_at: null,
			current_period_start: null,
			current_period_end: null,
		})),
	});

	return mergedPurchases.map((subscription) =>
		apiSubscriptionV1ToV0({ ctx, input: subscription }),
	);
};

// return {
// plan: input.plan ? planV1ToV0({ ctx, plan: input.plan }) : undefined,
// plan_id: input.plan_id,
// default: false,
// add_on: true,
// status: "active",
// past_due: false,
// canceled_at: null,
// expires_at: input.expires_at,
// trial_ends_at: null,
// started_at: input.started_at,
// current_period_start: null,
// current_period_end: null,
// quantity: input.quantity,
// };
