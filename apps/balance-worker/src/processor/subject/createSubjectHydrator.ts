import { subjectStateToFullSubject } from "@autumn/balance-engine";
import { ensureSubject } from "./actions/ensureSubject/ensureSubject.js";
import { ensureSubjectCatalog } from "./actions/ensureSubject/ensureSubjectCatalog.js";
import { readSubject, readSubjectCatalog } from "./actions/readSubject.js";
import { createInFlightLoads } from "./inFlightLoads/createInFlightLoads.js";
import type { SubjectHydratorContext, SubjectScope } from "./types/subject.js";
import type { SubjectHydrator } from "./types/subjectHydrator.js";

export const createSubjectHydrator = ({
	ctx,
}: {
	ctx: SubjectHydratorContext;
}): SubjectHydrator => {
	const scope: SubjectScope = {
		ctx,
		state: { inFlightLoads: createInFlightLoads() },
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
	};
};
