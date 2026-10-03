import { subjectStateToFullSubject } from "@autumn/balance-engine";
import { BALANCE_WORKER_CATALOG_RECHECK_MS } from "@autumn/env/balanceWorkerConstants";
import { markFullSubjectImmutable } from "@autumn/shared";
import { ensureSubject } from "./actions/ensureSubject/ensureSubject.js";
import { ensureSubjectCatalog } from "./actions/ensureSubject/ensureSubjectCatalog.js";
import { readSubject, readSubjectCatalog } from "./actions/readSubject.js";
import { createEntityLoads } from "./entityLoads/createEntityLoads.js";
import { createInFlightLoads } from "./inFlightLoads/createInFlightLoads.js";
import { createSnapshotRefresh } from "./snapshotRefresh/createSnapshotRefresh.js";
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
			entityLoads: createEntityLoads({ scopeOf: () => scope }),
			snapshotRefresh: createSnapshotRefresh({ ctx, scopeOf: () => scope }),
		},
	};

	return {
		ensure: ({ identity }) => ensureSubject({ scope, identity }),
		ensureCatalog: ({ identity, state }) =>
			ensureSubjectCatalog({ scope, identity, state }),
		readSubject: ({ state, identity }) =>
			readSubject({ scope, state, identity }),
		peekCatalog: ({ state }) => scope.state.joinCache.peekCatalog({ state }),
		readCatalog: ({ state }) => readSubjectCatalog({ scope, state }),
		readSubjectWith: ({ state, catalog, identity }) =>
			scope.state.joinCache.readFullSubject({
				state,
				entityId: identity.entityId,
				catalog,
				join: () =>
					markFullSubjectImmutable({
						fullSubject: subjectStateToFullSubject({
							state,
							catalog,
							entityId: identity.entityId,
						}),
					}),
			}),
		overtakeInFlightLoads: ({ customerKey }) =>
			scope.state.inFlightLoads.overtakeCustomer({ customerKey }),
		refreshSnapshots: ({ customer, subjects }) =>
			scope.state.snapshotRefresh.enqueue({ customer, subjects }),
		dispose: () => scope.state.snapshotRefresh.dispose(),
		inheritCatalog: ({ from, to, changes }) =>
			scope.state.joinCache.inheritCatalog({ from, to, changes }),
	};
};
