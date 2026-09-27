import { CusProductStatus } from "@autumn/shared";

export type PlanStatus =
	| "active"
	| "trialing"
	| "paused"
	| "canceling"
	| "past_due"
	| "expired"
	| "scheduled"
	| "pending";

export function resolvePlanStatus({
	status,
	canceled,
	trialing,
}: {
	status?: CusProductStatus;
	canceled?: boolean;
	trialing?: boolean;
}): PlanStatus {
	if (status === CusProductStatus.Paused) return "paused";
	if (status === CusProductStatus.Expired) return "expired";
	if (status === CusProductStatus.Scheduled) return "scheduled";
	if (status === CusProductStatus.Pending) return "pending";
	if (canceled) return "canceling";
	if (trialing || status === CusProductStatus.Trialing) return "trialing";
	if (status === CusProductStatus.PastDue) return "past_due";
	return "active";
}
