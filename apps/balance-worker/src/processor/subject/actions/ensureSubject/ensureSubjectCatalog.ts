import {
	type Catalog,
	type MeteringIdentity,
	planLicensesToItemCatalogKeys,
	type SubjectState,
	subjectStateToCatalogKeys,
	subjectStateToPlanLicenseCatalogKeys,
} from "@autumn/balance-engine";
import {
	ensureCatalogForKeys,
	ensureCatalogForState,
} from "@autumn/catalog-lru";
import type { SubjectScope } from "../../types/subject.js";
import { readPlanLicenseCatalogKeys } from "../readPlanLicenseCatalogKeys.js";

/** Best effort: only a read renders license definitions, so a link removed since hydration must not fail a track. */
const ensurePlanLicenseCatalog = async ({
	scope,
	identity,
	state,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
	state: SubjectState;
}): Promise<void> => {
	const { catalogCache } = scope.ctx;
	const planLicenses = await ensureCatalogForKeys({
		catalogCache,
		identity,
		keys: subjectStateToPlanLicenseCatalogKeys({ state }),
	});
	await ensureCatalogForKeys({
		catalogCache,
		identity,
		keys: planLicensesToItemCatalogKeys({ catalog: planLicenses }),
	});
};

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
	await ensureCatalogForState({ catalogCache, identity, state });
	await ensurePlanLicenseCatalog({ scope, identity, state });
	return catalogCache.read({
		keys: [
			...subjectStateToCatalogKeys({ state }),
			...readPlanLicenseCatalogKeys({ scope, state }),
		],
	});
};
