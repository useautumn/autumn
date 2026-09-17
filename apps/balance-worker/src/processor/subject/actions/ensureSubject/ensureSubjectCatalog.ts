import {
	type Catalog,
	type CustomerState,
	customerStateToCatalogKeys,
	filterCatalogKeysMissingFrom,
	type MeteringIdentity,
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
	state: CustomerState;
}): Promise<Catalog> => {
	const { catalogCache } = scope.ctx;
	const keys = customerStateToCatalogKeys({ state });

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
