import {
	type CustomerEntitlementFilters,
	resetIntvToEntIntv,
	type UpdateBalanceParams,
} from "@autumn/shared";

export const buildCustomerEntitlementFilters = ({
	params,
}: {
	params: UpdateBalanceParams;
}): CustomerEntitlementFilters | undefined => {
	const { customer_entitlement_id: cusEntId, interval } = params;

	const customerEntitlementFilters: CustomerEntitlementFilters | undefined =
		cusEntId || interval
			? {
					cusEntIds: cusEntId ? [cusEntId] : undefined,
					interval: interval
						? resetIntvToEntIntv({ resetIntv: interval })
						: undefined,
				}
			: undefined;

	return customerEntitlementFilters;
};
