import {
	type Catalog,
	type MeteringIdentity,
	planLicensesToItemCatalogKeys,
	type SubjectState,
	subjectStateToCatalogKeys,
	subjectStateToFreeTrialCatalogKeys,
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

/** Best effort, like plan licenses: only a read renders a trial, so one removed since hydration must not fail a track. */
const ensureFreeTrialCatalog = async ({
	scope,
	identity,
	state,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
	state: SubjectState;
}): Promise<void> => {
	await ensureCatalogForKeys({
		catalogCache: scope.ctx.catalogCache,
		identity,
		keys: subjectStateToFreeTrialCatalogKeys({ state }),
	});
};

/**
 * Every catalog row the state references is in the cache afterwards, or the
 * command cannot be decided. A state joined once while the catalog has not
 * moved since needs no second pass: its rows were all present when the join
 * was built, and nothing has expired or been invalidated in between. That
 * pass (keys computed, rows re-read, the catalog object rebuilt) was ~9% of
 * a pinned worker's thread, paid on every call.
 */
export const ensureSubjectCatalog = async ({
	scope,
	identity,
	state,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
	state: SubjectState;
}): Promise<Catalog> => {
	const joined = scope.state.joinCache.peekCatalog({ state });
	if (joined) return joined;
	const { catalogCache } = scope.ctx;
	await ensureCatalogForState({ catalogCache, identity, state });
	await ensurePlanLicenseCatalog({ scope, identity, state });
	await ensureFreeTrialCatalog({ scope, identity, state });
	const catalog = catalogCache.read({
		keys: [
			...subjectStateToCatalogKeys({ state }),
			...readPlanLicenseCatalogKeys({ scope, state }),
			...subjectStateToFreeTrialCatalogKeys({ state }),
		],
	});
	return scope.state.joinCache.readCatalog({ state, join: () => catalog });
};
