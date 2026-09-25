import {
	type Catalog,
	filterCatalogKeysMissingFrom,
	type MeteringIdentity,
	type SubjectState,
	subjectStateToCatalogKeys,
	subjectStateToFreeTrialCatalogKeys,
	subjectStateToFullSubject,
	type WorkerFullSubject,
} from "@autumn/balance-engine";
import { SubjectCatalogEvictedError } from "../subjectErrors.js";
import type { SubjectScope } from "../types/subject.js";
import { readPlanLicenseCatalogKeys } from "./readPlanLicenseCatalogKeys.js";

/** The catalog rows a state references, straight from the cache; `ensure` already filled it. */
const joinSubjectCatalog = ({
	scope,
	state,
}: {
	scope: SubjectScope;
	state: SubjectState;
}): Catalog => {
	const keys = subjectStateToCatalogKeys({ state });
	// `ensure` refreshed anything due moments ago, so a row that has since passed
	// its ttl is still the row it just fetched. Failing the request over that
	// timing gap cost roughly a sixth of all worker traffic under load.
	const catalog = scope.ctx.catalogCache.read({
		keys: [
			...keys,
			...readPlanLicenseCatalogKeys({ scope, state, allowStale: true }),
			...subjectStateToFreeTrialCatalogKeys({ state }),
		],
		allowStale: true,
	});
	const missing = filterCatalogKeysMissingFrom({ keys, catalog });
	if (missing.length > 0)
		throw new SubjectCatalogEvictedError({ keys: missing });
	return catalog;
};

/** The catalog rows a state references, joined once per state until the catalog moves. */
export const readSubjectCatalog = ({
	scope,
	state,
}: {
	scope: SubjectScope;
	state: SubjectState;
}): Catalog =>
	scope.state.views.readCatalog({
		state,
		join: () => joinSubjectCatalog({ scope, state }),
	});

/** Synchronous, on the freshest state inside the critical section. */
export const readSubject = ({
	scope,
	state,
	identity,
}: {
	scope: SubjectScope;
	state: SubjectState;
	identity: MeteringIdentity;
}): WorkerFullSubject =>
	scope.state.views.readFullSubject({
		state,
		entityId: identity.entityId,
		join: () =>
			subjectStateToFullSubject({
				state,
				catalog: readSubjectCatalog({ scope, state }),
				entityId: identity.entityId,
			}),
	});
