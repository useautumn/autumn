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
	const catalog = scope.ctx.catalogCache.read({ keys });
	const missing = filterCatalogKeysMissingFrom({ keys, catalog });
	if (missing.length > 0)
		throw new SubjectCatalogEvictedError({ keys: missing });
	return subjectStateToFullSubject({
		state,
		catalog,
		entityId: identity.entityId,
	});
};
