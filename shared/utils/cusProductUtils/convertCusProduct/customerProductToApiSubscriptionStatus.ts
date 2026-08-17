import type { SubscriptionStatus } from "@api/billing/common/customerPlanChange";
import { CusProductStatus } from "@models/cusProductModels/cusProductEnums";

/** Public API status collapses Trialing/PastDue into "active"; the underlying
 * state is conveyed via `past_due` / `trial_ends_at` instead. */
export const customerProductToApiSubscriptionStatus = ({
	status,
}: {
	status: CusProductStatus;
}): SubscriptionStatus => {
	switch (status) {
		case CusProductStatus.Scheduled:
			return "scheduled";
		case CusProductStatus.Expired:
		case CusProductStatus.Paused:
			return "expired";
		default:
			return "active";
	}
};
