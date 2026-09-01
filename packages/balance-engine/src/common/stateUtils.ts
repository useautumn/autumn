import {
	type CustomerMeteringState,
	customerMeteringStateSchema,
	type LeanCustomerEntitlement,
} from "./types/customerState/customerStateTypes.js";
import type { MeteringIdentity } from "./types/meteringIdentity.js";

export const createCustomerMeteringState = ({
	identity,
	customerEntitlementsByFeatureId,
}: {
	identity: MeteringIdentity;
	customerEntitlementsByFeatureId: Record<string, LeanCustomerEntitlement[]>;
}): CustomerMeteringState =>
	customerMeteringStateSchema.parse({
		schemaVersion: 1,
		identity,
		revision: 0,
		customerEntitlementsByFeatureId,
	});
