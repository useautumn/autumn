import {
	type CustomerEntitlementFilters,
	resetIntvToEntIntv,
	type UpdateBalanceParamsV0,
} from "@autumn/shared";

export const buildCustomerEntitlementFilters = ({
	params,
}: {
	params: UpdateBalanceParamsV0;
}): CustomerEntitlementFilters | undefined => {
	const { customer_entitlement_id: cusEntId, interval, balance_id } = params;

	const customerEntitlementFilters: CustomerEntitlementFilters | undefined =
		cusEntId || interval || balance_id
			? {
					cusEntIds: cusEntId ? [cusEntId] : undefined,
					interval: interval
						? resetIntvToEntIntv({ resetIntv: interval })
						: undefined,
					externalId: balance_id,
				}
			: undefined;

	return customerEntitlementFilters;
};
