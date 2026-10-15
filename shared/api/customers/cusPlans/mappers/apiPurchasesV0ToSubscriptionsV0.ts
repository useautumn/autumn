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
