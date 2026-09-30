import {
	type Catalog,
	filterCatalogForState,
	mergeCatalogs,
} from "@autumn/balance-engine";
import type { SharedCatalog } from "../../../state/types/catalogStore.js";
import type { StoredSubject } from "../../../state/types/storedSubject.js";

/**
 * The catalog a subject is joined to: whichever of the customer's own copy and the shared catalog Autumn read later.
 * Where the shared catalog is the later one, the customer's copy still covers the rows it lacks.
 */
export const freshestCatalog = ({
	stored,
	shared,
}: {
	stored: StoredSubject;
	shared: SharedCatalog | null;
}): Catalog => {
	if (!shared) return stored.catalog;

	const customerWasReadLater = stored.readAt > shared.readAt;
	if (customerWasReadLater) return stored.catalog;

	const sharedRows = filterCatalogForState({
		state: stored.state,
		catalog: shared.catalog,
	});
	return mergeCatalogs({ catalogs: [stored.catalog, sharedRows] });
};
