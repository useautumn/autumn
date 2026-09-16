import type { CustomerState } from "../../models/customerState.js";
import type { MeteringIdentity } from "../../models/meteringIdentity.js";
import type { LeanCustomerEntitlement } from "../../models/rows/leanCustomerEntitlement.js";
import { parseCustomerState } from "../../parsers.js";

export const createCustomerState = ({
	identity,
	customerEntitlements,
}: {
	identity: MeteringIdentity;
	customerEntitlements: LeanCustomerEntitlement[];
}): CustomerState =>
	parseCustomerState({
		input: {
			schemaVersion: 1,
			identity,
			revision: 0,
			customerEntitlements: Object.fromEntries(
				customerEntitlements.map((customerEntitlement) => [
					customerEntitlement.id,
					customerEntitlement,
				]),
			),
		},
	});
