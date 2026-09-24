import type { Catalog } from "../../models/catalog/catalog.js";
import type { CatalogKey } from "../../models/catalog/catalogKey.js";
import type { CatalogRow } from "../../models/catalog/catalogRow.js";
import type { SubjectState } from "../../models/subject/subjectState.js";
import { parseCatalog } from "../../parsers.js";

export const catalogKeyToString = ({ key }: { key: CatalogKey }): string =>
	`${key.table}:${key.id}`;

/** Entitlements, prices, plan licenses and free trials are addressed by id, products and features by internal_id. */
export const catalogRowToCatalogKey = ({
	row,
}: {
	row: CatalogRow;
}): CatalogKey =>
	row.table === "products" || row.table === "features"
		? { table: row.table, id: row.row.internal_id }
		: { table: row.table, id: row.row.id };

const compareCatalogKeys = (left: CatalogKey, right: CatalogKey): number =>
	left.table.localeCompare(right.table) || left.id.localeCompare(right.id);

/** Every catalog row the state references, distinct and in a stable order. */
export const subjectStateToCatalogKeys = ({
	state,
}: {
	state: SubjectState;
}): CatalogKey[] => {
	const keysByString = new Map<string, CatalogKey>();
	const add = (key: CatalogKey) =>
		keysByString.set(catalogKeyToString({ key }), key);

	for (const customerProduct of state.customerProducts) {
		add({ table: "products", id: customerProduct.internal_product_id });
	}
	for (const customerPrice of state.customerPrices) {
		if (customerPrice.price_id)
			add({ table: "prices", id: customerPrice.price_id });
	}
	for (const customerEntitlement of state.customerEntitlements) {
		add({ table: "entitlements", id: customerEntitlement.entitlement_id });
		add({ table: "features", id: customerEntitlement.internal_feature_id });
	}

	return [...keysByString.values()].sort(compareCatalogKeys);
};

/** The definitions of the state's license pools. Only a read renders them, so a link removed since hydration renders as none rather than failing. */
export const subjectStateToPlanLicenseCatalogKeys = ({
	state,
}: {
	state: SubjectState;
}): CatalogKey[] =>
	[
		...new Set(
			state.customerLicenses.flatMap(({ plan_license_id }) =>
				plan_license_id ? [plan_license_id] : [],
			),
		),
	]
		.sort()
		.map((id) => ({ table: "planLicenses", id }));

/** The trials behind the state's products. Only a read renders them, so a trial removed since hydration renders as none rather than failing. */
export const subjectStateToFreeTrialCatalogKeys = ({
	state,
}: {
	state: SubjectState;
}): CatalogKey[] =>
	[
		...new Set(
			state.customerProducts.flatMap(({ free_trial_id }) =>
				free_trial_id ? [free_trial_id] : [],
			),
		),
	]
		.sort()
		.map((id) => ({ table: "freeTrials", id }));

/** The rows the catalog's plan licenses are made of: each license's product and its effective items. */
export const planLicensesToItemCatalogKeys = ({
	catalog,
}: {
	catalog: Catalog;
}): CatalogKey[] => {
	const keysByString = new Map<string, CatalogKey>();
	const add = (key: CatalogKey) =>
		keysByString.set(catalogKeyToString({ key }), key);

	for (const planLicense of Object.values(catalog.planLicenses)) {
		add({ table: "products", id: planLicense.license_internal_product_id });
		for (const id of planLicense.price_ids) add({ table: "prices", id });
		for (const id of planLicense.entitlement_ids)
			add({ table: "entitlements", id });
		for (const id of planLicense.internal_feature_ids)
			add({ table: "features", id });
	}

	return [...keysByString.values()].sort(compareCatalogKeys);
};

export const catalogRowsToCatalog = ({
	rows,
}: {
	rows: CatalogRow[];
}): Catalog => {
	const catalog: Catalog = {
		entitlements: {},
		products: {},
		features: {},
		prices: {},
		planLicenses: {},
		freeTrials: {},
	};
	for (const tagged of rows) {
		const { id } = catalogRowToCatalogKey({ row: tagged });
		switch (tagged.table) {
			case "entitlements":
				catalog.entitlements[id] = tagged.row;
				break;
			case "products":
				catalog.products[id] = tagged.row;
				break;
			case "features":
				catalog.features[id] = tagged.row;
				break;
			case "prices":
				catalog.prices[id] = tagged.row;
				break;
			case "planLicenses":
				catalog.planLicenses[id] = tagged.row;
				break;
			case "freeTrials":
				catalog.freeTrials[id] = tagged.row;
				break;
		}
	}
	return parseCatalog({ input: catalog });
};

/** One catalog holding every row of each; a row both hold is the same row. */
export const mergeCatalogs = ({
	catalogs,
}: {
	catalogs: Catalog[];
}): Catalog => ({
	entitlements: Object.assign(
		{},
		...catalogs.map((catalog) => catalog.entitlements),
	),
	products: Object.assign({}, ...catalogs.map((catalog) => catalog.products)),
	features: Object.assign({}, ...catalogs.map((catalog) => catalog.features)),
	prices: Object.assign({}, ...catalogs.map((catalog) => catalog.prices)),
	planLicenses: Object.assign(
		{},
		...catalogs.map((catalog) => catalog.planLicenses),
	),
	freeTrials: Object.assign(
		{},
		...catalogs.map((catalog) => catalog.freeTrials),
	),
});
