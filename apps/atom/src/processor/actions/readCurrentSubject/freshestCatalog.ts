import {
	type Catalog,
	filterCatalogForState,
	mergeCatalogs,
} from "@autumn/balance-engine";
import type { SharedCatalog } from "../../../state/types/catalogStore.js";
import type { StoredSubject } from "../../../state/types/storedSubject.js";

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
