import {
	type CustomerEntitlementFilters,
	type DeleteBalanceParamsV0,
	resetIntvToEntIntv,
	type UpdateBalanceParamsV0,
} from "@autumn/shared";

export const buildCustomerEntitlementFilters = ({
	params,
}: {
	params: UpdateBalanceParamsV0 | DeleteBalanceParamsV0;
}): CustomerEntitlementFilters | undefined => {
	const { interval, balance_id } = params;

	const cusEntId =
		"customer_entitlement_id" in params
			? params.customer_entitlement_id
			: undefined;

	const customerEntitlementFilters: CustomerEntitlementFilters | undefined =
		cusEntId || interval || balance_id
			? {
					cusEntIds: cusEntId ? [cusEntId] : undefined,
					interval: interval
						? resetIntvToEntIntv({ resetIntv: interval })
						: undefined,
					balanceId: balance_id,
				}
			: undefined;

	return customerEntitlementFilters;
};
