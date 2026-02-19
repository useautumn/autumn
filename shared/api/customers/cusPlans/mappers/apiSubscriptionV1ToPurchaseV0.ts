import type { ApiPurchaseV0, ApiSubscriptionV1 } from "../apiSubscriptionV1";

export function apiSubscriptionV1ToPurchaseV0({
	apiSubscriptionV1,
}: {
	apiSubscriptionV1: ApiSubscriptionV1;
}): ApiPurchaseV0 {
	const input = apiSubscriptionV1;

	return {
		plan: input.plan,
		plan_id: input.plan_id,
		expires_at: input.expires_at,
		started_at: input.started_at,
		quantity: input.quantity,
	};
}
