import type { ApiSubscriptionV1 } from "@api/customers/cusPlans/apiSubscriptionV1.js";
import type { ApiPlanV1 } from "@api/products/apiPlanV1.js";

const defaultStartedAt = new Date("2026-01-01T00:00:00.000Z");
const dateToEpochMs = (date: Date | null) => date?.getTime() ?? null;

/** Base subscription fixture; pass plan to include the expanded plan response. */
export const baseSubscription = ({
	id,
	plan,
	planId = plan?.id ?? "pro",
	status = "active",
	startedAt = defaultStartedAt,
	currentPeriodStart = startedAt,
	currentPeriodEnd = null,
}: {
	id?: string;
	plan?: ApiPlanV1;
	planId?: string;
	status?: ApiSubscriptionV1["status"];
	startedAt?: Date;
	currentPeriodStart?: Date | null;
	currentPeriodEnd?: Date | null;
}): ApiSubscriptionV1 => ({
	id: id ?? `sub_${planId}`,
	plan,
	plan_id: planId,
	auto_enable: false,
	add_on: false,
	status,
	past_due: false,
	canceled_at: null,
	expires_at: null,
	trial_ends_at: null,
	started_at: startedAt.getTime(),
	current_period_start: dateToEpochMs(currentPeriodStart),
	current_period_end: dateToEpochMs(currentPeriodEnd),
	quantity: 1,
});
