import type { CustomerState } from "../../models/customerState.js";
import type { LeanCustomerEntitlement } from "../../models/rows/leanCustomerEntitlement.js";

export const findCustomerEntitlementsForFeature = ({
	state,
	featureId,
}: {
	state: CustomerState;
	featureId: string;
}): LeanCustomerEntitlement[] =>
	Object.values(state.customerEntitlements)
		.filter(
			(customerEntitlement) => customerEntitlement.featureId === featureId,
		)
		.sort(({ id: left }, { id: right }) =>
			left < right ? -1 : left > right ? 1 : 0,
		);
