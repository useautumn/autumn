import type { MeteringIdentity } from "../../models/identity/meteringIdentity.js";
import type { SubjectState } from "../../models/subject/subjectState.js";
import { parseSubjectState } from "../../parsers.js";

type SubjectStateRows = Partial<
	Pick<
		SubjectState,
		| "customer"
		| "customerProducts"
		| "customerPrices"
		| "customerEntitlements"
		| "rollovers"
		| "replaceables"
		| "usageWindows"
		| "openLocks"
		| "pooledBalances"
		| "customerLicenses"
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
		spend_limits: null,
		overage_allowed: null,
		usage_limits: null,
	},
	customerProducts = [],
	customerPrices = [],
	customerEntitlements = [],
	rollovers = [],
	replaceables = [],
	usageWindows = [],
	openLocks = [],
	pooledBalances = [],
	customerLicenses = [],
	entity = null,
}: { identity: MeteringIdentity } & SubjectStateRows): SubjectState =>
	parseSubjectState({
		input: {
			schemaVersion: 1,
			identity,
			revision: 0,
			customer,
			customerProducts,
			customerPrices,
			customerEntitlements,
			rollovers,
			replaceables,
			usageWindows,
			openLocks,
			pooledBalances,
			customerLicenses,
			entity,
		},
	});
