import {
	type Catalog,
	type MeteringIdentity,
	planLicensesToItemCatalogKeys,
	type SubjectState,
	subjectStateToFreeTrialCatalogKeys,
	subjectStateToPlanLicenseCatalogKeys,
} from "@autumn/balance-engine";
import {
	ensureCatalogForKeys,
	ensureCatalogForState,
} from "@autumn/catalog-lru";
import type { SubjectScope } from "../../types/subject.js";
import { readSubjectCatalog } from "../readSubject.js";

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
	return readSubjectCatalog({ scope, state });
};
