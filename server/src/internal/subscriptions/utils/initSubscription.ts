import type { AppEnv, Subscription } from "@autumn/shared";
import { generateId } from "@/utils/genUtils.js";

export const initSubscription = ({
	stripeId,
	stripeScheduleId,
	orgId,
	env,
	currentPeriodStart,
	currentPeriodEnd,
	billingCycleAnchorSeconds,
}: {
	stripeId?: string;
	stripeScheduleId?: string;
	orgId: string;
	env: AppEnv;
	currentPeriodStart?: number;
	currentPeriodEnd?: number;
	billingCycleAnchorSeconds?: number;
}) => {
	const newSub: Subscription = {
		id: generateId("sub"),
		stripe_id: stripeId || null,
		stripe_schedule_id: stripeScheduleId || null,
		created_at: Date.now(),
		usage_features: [],
		org_id: orgId,
		env: env,
		current_period_start: currentPeriodStart || null,
		current_period_end: currentPeriodEnd || null,
		billing_cycle_anchor_seconds: billingCycleAnchorSeconds ?? null,
	};

	return newSub;
};
