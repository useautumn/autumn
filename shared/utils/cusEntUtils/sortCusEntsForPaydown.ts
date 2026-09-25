import type { FullCustomerEntitlementView } from "../../models/cusProductModels/cusEntModels/fullCustomerEntitlementView.js";

type PaydownOrderFields = Pick<
	FullCustomerEntitlementView,
	"usage_allowed" | "created_at"
>;

/** Overage heals where it accrued first (`usage_allowed` rows), oldest first; ties keep the input order. */
export const sortCusEntsForPaydown = <CE extends PaydownOrderFields>({
	customerEntitlements,
}: {
	customerEntitlements: CE[];
}): CE[] =>
	[...customerEntitlements].sort((left, right) => {
		const leftUsageAllowed = left.usage_allowed ?? false;
		const rightUsageAllowed = right.usage_allowed ?? false;
		if (leftUsageAllowed !== rightUsageAllowed)
			return leftUsageAllowed ? -1 : 1;
		return (left.created_at ?? 0) - (right.created_at ?? 0);
	});
