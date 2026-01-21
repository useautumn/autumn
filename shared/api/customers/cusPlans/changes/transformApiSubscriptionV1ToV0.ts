import type { ApiSubscription } from "@api/customers/cusPlans/apiSubscription.js";
import type { ApiSubscriptionV1 } from "@api/customers/cusPlans/apiSubscriptionV1.js";

export function transformApiSubscriptionV1ToV0({
	input,
}: {
	input: ApiSubscriptionV1;
}): ApiSubscription {
	return {
		plan: input.plan,
		plan_id: input.plan_id,
		default: input.auto_enable,
		add_on: input.add_on,
		status: input.status,
		past_due: input.past_due,
		canceled_at: input.canceled_at,
		expires_at: input.expires_at,
		trial_ends_at: input.trial_ends_at,
		started_at: input.started_at,
		current_period_start: input.current_period_start,
		current_period_end: input.current_period_end,
		quantity: input.quantity,
	};
}
