import type { SubscriptionStatus } from "@api/billing/common/customerPlanChange";
import { CusProductStatus } from "@models/cusProductModels/cusProductEnums";

export const customerProductToApiSubscriptionStatus = ({
	status,
}: {
	status: CusProductStatus;
}): SubscriptionStatus => {
	switch (status) {
		case CusProductStatus.Scheduled:
		case CusProductStatus.Pending:
			return "scheduled";
		case CusProductStatus.Expired:
		case CusProductStatus.Paused:
			return "expired";
		default:
			return "active";
	}
};
