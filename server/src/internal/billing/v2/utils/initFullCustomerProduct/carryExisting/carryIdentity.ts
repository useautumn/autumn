import type { FullCustomerEntitlement } from "@autumn/shared";

export type CustomerEntitlementCarryIdentity = {
	internalFeatureId: string;
};

export const carryIdentityToKey = (
	identity: CustomerEntitlementCarryIdentity,
) => identity.internalFeatureId;

export const customerEntitlementToCarryIdentity = ({
	customerEntitlement,
}: {
	customerEntitlement: FullCustomerEntitlement;
}): CustomerEntitlementCarryIdentity => {
	const entitlement = customerEntitlement.entitlement;

	return {
		internalFeatureId: entitlement.internal_feature_id,
	};
};
