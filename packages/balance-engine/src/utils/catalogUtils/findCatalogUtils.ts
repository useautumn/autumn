import type { Feature } from "@autumn/shared";
import type { Catalog } from "../../models/catalog/catalog.js";

/** Commands name the public feature id; the catalog is keyed by internal_id. */
export const findFeatureById = ({
	catalog,
	featureId,
}: {
	catalog: Catalog;
	featureId: string;
}): Feature | undefined =>
	Object.values(catalog.features).find((feature) => feature.id === featureId);
