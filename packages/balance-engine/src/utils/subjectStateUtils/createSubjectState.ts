import type { MeteringIdentity } from "../../models/meteringIdentity.js";
import type { WorkerCustomer } from "../../models/rows/workerCustomer.js";
import type { SubjectState } from "../../models/subjectState.js";
import { parseSubjectState } from "../../parsers.js";

type SubjectStateRows = Partial<
	Pick<
		SubjectState,
		| "customer"
		| "customerProducts"
		| "customerEntitlements"
		| "rollovers"
		| "entity"
	>
>;

/** `customer` defaults to the identity's ids with no config; row-backed callers pass the real row. */
export const createSubjectState = ({
	identity,
	customer = {
		internal_id: identity.customerId,
		id: identity.customerId,
		config: null,
	},
	customerProducts = [],
	customerEntitlements = [],
	rollovers = [],
	entity = null,
}: { identity: MeteringIdentity } & SubjectStateRows): SubjectState =>
	parseSubjectState({
		input: {
			schemaVersion: 1,
			identity,
			revision: 0,
			customer,
			customerProducts,
			customerEntitlements,
			rollovers,
			entity,
		},
	});
