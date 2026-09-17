import type { CustomerState } from "../../models/customerState.js";
import type { MeteringIdentity } from "../../models/meteringIdentity.js";
import { parseCustomerState } from "../../parsers.js";

type CustomerStateRows = Partial<
	Pick<
		CustomerState,
		"customerProducts" | "customerEntitlements" | "rollovers" | "entities"
	>
>;

export const createCustomerState = ({
	identity,
	customerProducts = [],
	customerEntitlements = [],
	rollovers = [],
	entities = [],
}: { identity: MeteringIdentity } & CustomerStateRows): CustomerState =>
	parseCustomerState({
		input: {
			schemaVersion: 1,
			identity,
			revision: 0,
			customerProducts,
			customerEntitlements,
			rollovers,
			entities,
		},
	});
