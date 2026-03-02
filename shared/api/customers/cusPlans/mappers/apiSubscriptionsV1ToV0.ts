import type { CusProductStatus } from "@models/cusProductModels/cusProductEnums";
import { ACTIVE_STATUSES } from "@utils/cusProductUtils/cusProductConstants";
import type { SharedContext } from "../../../../types/sharedContext";
import type { ApiSubscription } from "../apiSubscription";
import type { ApiSubscriptionV1 } from "../apiSubscriptionV1";
import { apiSubscriptionV1ToV0 } from "./apiSubscriptionV1ToV0";

const getSubscriptionStatusKey = (cp: ApiSubscriptionV1) => {
	if (!("status" in cp)) return undefined;
	if (ACTIVE_STATUSES.includes(cp.status as CusProductStatus)) return "active";
	return cp.status;
};

/**
 * Merges subscription responses by plan_id + status.
 * Subscriptions for the same plan in the same status group are combined:
 * quantities are summed, started_at takes the earliest, canceled_at takes the latest non-null.
 */
export const mergeSubscriptionResponses = ({
	subscriptions,
}: {
	subscriptions: ApiSubscriptionV1[];
}): ApiSubscriptionV1[] => {
	const getPlanKey = (cp: ApiSubscriptionV1) => {
		return `${cp.plan_id}:${getSubscriptionStatusKey(cp)}`;
	};

	const record: Record<string, ApiSubscriptionV1> = {};

	for (const curr of subscriptions) {
		const key = getPlanKey(curr);
		const latest = record[key];

		const currStartedAt = curr.started_at;

		const curCanceledAt = "canceled_at" in curr ? curr.canceled_at : null;
		const curQuantity = "quantity" in curr ? curr.quantity : 0;

		record[key] = {
			...(latest || curr),
			canceled_at: curCanceledAt ? curCanceledAt : latest?.canceled_at || null,
			started_at: latest?.started_at
				? Math.min(latest?.started_at, currStartedAt)
				: currStartedAt,
			quantity: (latest?.quantity || 0) + curQuantity,
		};
	}

	return Object.values(record);
};

export const apiSubscriptionsV1ToV0 = ({
	input,
	ctx,
}: {
	ctx: SharedContext;
	input: ApiSubscriptionV1[];
}): ApiSubscription[] => {
	const mergedSubscriptions = mergeSubscriptionResponses({
		subscriptions: input,
	});

	return mergedSubscriptions.map((subscription) =>
		apiSubscriptionV1ToV0({ ctx, input: subscription }),
	);
};
