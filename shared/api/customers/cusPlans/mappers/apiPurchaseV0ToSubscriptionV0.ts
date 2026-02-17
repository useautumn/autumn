import { planV1ToV0 } from "@api/products/mappers/planV1ToV0.js";
import type { SharedContext } from "../../../../types/sharedContext.js";
import type { ApiSubscription } from "../apiSubscription.js";
import type { ApiPurchaseV0 } from "../apiSubscriptionV1.js";

/**
 * Converts an ApiPurchaseV0 to an ApiSubscription (V0) for backwards compatibility.
 * Purchases are represented as subscriptions with sensible defaults for missing fields.
 */
export function apiPurchaseV0ToSubscriptionV0({
	ctx,
	input,
}: {
	ctx: SharedContext;
	input: ApiPurchaseV0;
}): ApiSubscription {
	return {
		plan: input.plan ? planV1ToV0({ ctx, plan: input.plan }) : undefined,
		plan_id: input.plan_id,
		default: false,
		add_on: true,
		status: "active",
		past_due: false,
		canceled_at: null,
		expires_at: input.expires_at,
		trial_ends_at: null,
		started_at: input.started_at,
		current_period_start: null,
		current_period_end: null,
		quantity: input.quantity,
	};
}
