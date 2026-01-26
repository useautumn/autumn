import type { ApiSubscription } from "@api/customers/cusPlans/apiSubscription.js";
import type { ApiSubscriptionV1 } from "@api/customers/cusPlans/apiSubscriptionV1.js";
import type { ApiPlan } from "@api/products/apiPlan.js";
import type { ApiPlanV1 } from "@api/products/apiPlanV1.js";

/**
 * Transform ApiPlanV1 (V2.1) to ApiPlan (V2.0) for nested plan in subscription
 */
function transformPlanV1ToV0(plan: ApiPlanV1): ApiPlan {
	return {
		...plan,
		default: plan.auto_enable,
		features: plan.features.map((feature) => {
			const { included, ...restFeature } = feature;
			return {
				...restFeature,
				granted_balance: included,
				reset: feature.reset
					? {
							interval: feature.reset.interval,
							interval_count: feature.reset.interval_count,
							reset_when_enabled: false,
						}
					: null,
			};
		}),
	};
}

export function transformApiSubscriptionV1ToV0({
	input,
}: {
	input: ApiSubscriptionV1;
}): ApiSubscription {
	return {
		plan: input.plan ? transformPlanV1ToV0(input.plan) : undefined,
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
