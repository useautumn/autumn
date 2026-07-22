import type {
	FullCustomerEntitlement,
	InsertPooledBalanceContribution,
} from "@autumn/shared";

export const normalizePooledBalanceContributionCustomerEntitlement = ({
	contributionCustomerEntitlement,
	contribution,
}: {
	contributionCustomerEntitlement: FullCustomerEntitlement;
	contribution: Pick<InsertPooledBalanceContribution, "id">;
}) => {
	contributionCustomerEntitlement.pooled_contribution_id = contribution.id;
	contributionCustomerEntitlement.pooled_balance_id = null;
	contributionCustomerEntitlement.balance = 0;
	contributionCustomerEntitlement.adjustment = 0;
	contributionCustomerEntitlement.additional_balance = 0;
	contributionCustomerEntitlement.entities = null;
};
