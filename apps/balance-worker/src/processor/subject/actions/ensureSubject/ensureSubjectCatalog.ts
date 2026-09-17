import {
	type Catalog,
	filterCatalogKeysMissingFrom,
	type MeteringIdentity,
	type SubjectState,
	subjectStateToCatalogKeys,
} from "@autumn/balance-engine";
import { CatalogRowsNotFoundError } from "../../../../catalog/catalogErrors.js";
import type { SubjectScope } from "../../types/subject.js";

/** Every catalog row the state references is in the cache afterwards, or the command cannot be decided. */
export const ensureSubjectCatalog = async ({
	scope,
	identity,
	state,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
	state: SubjectState;
}): Promise<Catalog> => {
	const { catalogCache } = scope.ctx;
	const keys = subjectStateToCatalogKeys({ state });

	const cached = catalogCache.read({ keys });
	const missing = filterCatalogKeysMissingFrom({ keys, catalog: cached });
	if (missing.length === 0) return cached;

	await catalogCache.load({ identity, keys: missing });

	const loaded = catalogCache.read({ keys });
	const stillMissing = filterCatalogKeysMissingFrom({ keys, catalog: loaded });
	if (stillMissing.length > 0) {
		throw new CatalogRowsNotFoundError({ keys: stillMissing });
	}
	return loaded;
};
