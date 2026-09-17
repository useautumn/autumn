import {
	type Catalog,
	type CustomerState,
	customerStateToCatalogKeys,
	filterCatalogKeysMissingFrom,
} from "@autumn/balance-engine";
import { SubjectCatalogEvictedError } from "../subjectErrors.js";
import type { SubjectScope } from "../types/subject.js";

/** Synchronous, for the freshest state inside the critical section; `ensureSubject` already filled the cache. */
export const readSubjectCatalog = ({
	scope,
	state,
}: {
	scope: SubjectScope;
	state: CustomerState;
}): Catalog => {
	const keys = customerStateToCatalogKeys({ state });
	const catalog = scope.ctx.catalogCache.read({ keys });
	const missing = filterCatalogKeysMissingFrom({ keys, catalog });
	if (missing.length > 0)
		throw new SubjectCatalogEvictedError({ keys: missing });
	return catalog;
};
