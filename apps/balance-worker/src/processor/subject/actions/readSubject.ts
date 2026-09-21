import {
	filterCatalogKeysMissingFrom,
	type MeteringIdentity,
	type SubjectState,
	subjectStateToCatalogKeys,
	subjectStateToFullSubject,
	type WorkerFullSubject,
} from "@autumn/balance-engine";
import { SubjectCatalogEvictedError } from "../subjectErrors.js";
import type { SubjectScope } from "../types/subject.js";

/** Synchronous, on the freshest state inside the critical section; `ensure` already filled the cache. */
export const readSubject = ({
	scope,
	state,
	identity,
}: {
	scope: SubjectScope;
	state: SubjectState;
	identity: MeteringIdentity;
}): WorkerFullSubject => {
	const keys = subjectStateToCatalogKeys({ state });
	// `ensure` refreshed anything due moments ago, so a row that has since passed
	// its ttl is still the row it just fetched. Failing the request over that
	// timing gap cost roughly a sixth of all worker traffic under load.
	const catalog = scope.ctx.catalogCache.read({ keys, allowStale: true });
	const missing = filterCatalogKeysMissingFrom({ keys, catalog });
	if (missing.length > 0)
		throw new SubjectCatalogEvictedError({ keys: missing });
	return subjectStateToFullSubject({
		state,
		catalog,
		entityId: identity.entityId,
	});
};
