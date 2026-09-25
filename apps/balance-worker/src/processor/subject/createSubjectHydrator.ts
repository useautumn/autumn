import { subjectStateToFullSubject } from "@autumn/balance-engine";
import { BALANCE_WORKER_CATALOG_RECHECK_MS } from "@autumn/env/balanceWorkerConstants";
import { ensureSubject } from "./actions/ensureSubject/ensureSubject.js";
import { ensureSubjectCatalog } from "./actions/ensureSubject/ensureSubjectCatalog.js";
import { readSubject, readSubjectCatalog } from "./actions/readSubject.js";
import { createInFlightLoads } from "./inFlightLoads/createInFlightLoads.js";
import { createSubjectJoinCache } from "./subjectJoinCache/createSubjectJoinCache.js";
import type { SubjectHydratorContext, SubjectScope } from "./types/subject.js";
import type { SubjectHydrator } from "./types/subjectHydrator.js";

export const createSubjectHydrator = ({
	ctx,
}: {
	ctx: SubjectHydratorContext;
}): SubjectHydrator => {
	const scope: SubjectScope = {
		ctx,
		state: {
			inFlightLoads: createInFlightLoads(),
			joinCache: createSubjectJoinCache({
				ctx: {
					catalogCache: ctx.catalogCache,
					config: { catalogRecheckMs: BALANCE_WORKER_CATALOG_RECHECK_MS },
				},
			}),
		},
	};

	return {
		ensure: ({ identity }) => ensureSubject({ scope, identity }),
		ensureCatalog: ({ identity, state }) =>
			ensureSubjectCatalog({ scope, identity, state }),
		readSubject: ({ state, identity }) =>
			readSubject({ scope, state, identity }),
		readCatalog: ({ state }) => readSubjectCatalog({ scope, state }),
		readSubjectWith: ({ state, catalog, identity }) =>
			subjectStateToFullSubject({
				state,
				catalog,
				entityId: identity.entityId,
			}),
		overtakeInFlightLoads: ({ customerKey }) =>
			scope.state.inFlightLoads.overtakeCustomer({ customerKey }),
		inheritCatalog: ({ from, to, changes }) =>
			scope.state.joinCache.inheritCatalog({ from, to, changes }),
	};
};
