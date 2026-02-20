import { planV1ToV0 } from "@api/products/mappers/planV1ToV0";
import type { ApiSubscription } from "../apiSubscription";
import type { ApiSubscriptionV1 } from "../apiSubscriptionV1";

export function transformApiSubscriptionV1ToV0({
	input,
}: {
	input: ApiSubscriptionV1;
}): ApiSubscription {
	return {
		plan: input.plan ? planV1ToV0(input.plan) : undefined,
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
