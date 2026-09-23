import {
	type Catalog,
	filterCatalogKeysMissingFrom,
	type MeteringIdentity,
	type SubjectState,
	subjectStateToCatalogKeys,
} from "@autumn/balance-engine";
import { CatalogRowsNotFoundError } from "../catalogErrors.js";
import type { CatalogCache } from "../types/catalogCache.js";
import { ensureCatalogForKeys } from "./ensureCatalogForKeys.js";

/** Every catalog row the state references is in the cache afterwards, or the state cannot be read against it. */
export const ensureCatalogForState = async ({
	catalogCache,
	identity,
	state,
}: {
	catalogCache: Pick<CatalogCache, "read" | "load">;
	identity: MeteringIdentity;
	state: SubjectState;
}): Promise<Catalog> => {
	const keys = subjectStateToCatalogKeys({ state });
	const loaded = await ensureCatalogForKeys({ catalogCache, identity, keys });
	const missing = filterCatalogKeysMissingFrom({ keys, catalog: loaded });
	if (missing.length > 0) throw new CatalogRowsNotFoundError({ keys: missing });
	return loaded;
};
