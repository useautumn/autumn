import type { FullCustomerEntitlement } from "@autumn/shared";

export const normalizePooledBalanceContributionCustomerEntitlement = ({
	contributionCustomerEntitlement,
}: {
	contributionCustomerEntitlement: FullCustomerEntitlement;
}) => {
	contributionCustomerEntitlement.balance = 0;
	contributionCustomerEntitlement.adjustment = 0;
	contributionCustomerEntitlement.additional_balance = 0;
	contributionCustomerEntitlement.entities = null;
};
