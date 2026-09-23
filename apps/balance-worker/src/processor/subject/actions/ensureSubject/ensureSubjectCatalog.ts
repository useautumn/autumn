import type {
	Catalog,
	MeteringIdentity,
	SubjectState,
} from "@autumn/balance-engine";
import { ensureCatalogForState } from "@autumn/catalog-lru";
import type { SubjectScope } from "../../types/subject.js";

/** Every catalog row the state references is in the cache afterwards, or the command cannot be decided. */
export const ensureSubjectCatalog = ({
	scope,
	identity,
	state,
}: {
	scope: SubjectScope;
	identity: MeteringIdentity;
	state: SubjectState;
}): Promise<Catalog> =>
	ensureCatalogForState({
		catalogCache: scope.ctx.catalogCache,
		identity,
		state,
	});
