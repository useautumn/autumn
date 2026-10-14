import type { Catalog } from "../../models/catalog/catalog.js";
import type { CatalogKey } from "../../models/catalog/catalogKey.js";
import type { SubjectState } from "../../models/subject/subjectState.js";
import {
	planLicensesToItemCatalogKeys,
	subjectStateToCatalogKeys,
	subjectStateToPlanLicenseCatalogKeys,
} from "./convertCatalogUtils.js";

export const filterCatalogKeysMissingFrom = ({
	keys,
	catalog,
}: {
	keys: CatalogKey[];
	catalog: Catalog;
}): CatalogKey[] => keys.filter((key) => !(key.id in catalog[key.table]));

export const filterCatalogForState = ({
	state,
	catalog,
}: {
	state: SubjectState;
	catalog: Catalog;
}): Catalog => {
	const slim: Catalog = {
		entitlements: {},
		products: {},
		features: {},
		prices: {},
		planLicenses: {},
		freeTrials: {},
	};
	const pick = (key: CatalogKey) => {
		const row = catalog[key.table][key.id];
		if (row) slim[key.table][key.id] = row;
	};
	for (const key of subjectStateToCatalogKeys({ state })) pick(key);
	for (const key of subjectStateToPlanLicenseCatalogKeys({ state })) pick(key);
	for (const key of planLicensesToItemCatalogKeys({ catalog: slim })) pick(key);
	return slim;
};
