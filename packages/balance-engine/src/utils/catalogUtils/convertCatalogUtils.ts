import type { Catalog } from "../../models/catalog/catalog.js";
import type { CatalogKey } from "../../models/catalog/catalogKey.js";
import type { CatalogRow } from "../../models/catalog/catalogRow.js";
import type { CustomerState } from "../../models/customerState.js";
import { parseCatalog } from "../../parsers.js";

export const catalogKeyToString = ({ key }: { key: CatalogKey }): string =>
	`${key.table}:${key.id}`;

/** Entitlements are addressed by id, products and features by internal_id. */
export const catalogRowToCatalogKey = ({
	row,
}: {
	row: CatalogRow;
}): CatalogKey =>
	row.table === "entitlements"
		? { table: row.table, id: row.row.id }
		: { table: row.table, id: row.row.internal_id };

const compareCatalogKeys = (left: CatalogKey, right: CatalogKey): number =>
	left.table.localeCompare(right.table) || left.id.localeCompare(right.id);

/** Every catalog row the state references, distinct and in a stable order. */
export const customerStateToCatalogKeys = ({
	state,
}: {
	state: CustomerState;
}): CatalogKey[] => {
	const keysByString = new Map<string, CatalogKey>();
	const add = (key: CatalogKey) =>
		keysByString.set(catalogKeyToString({ key }), key);

	for (const customerProduct of state.customerProducts) {
		add({ table: "products", id: customerProduct.internal_product_id });
	}
	for (const customerEntitlement of state.customerEntitlements) {
		add({ table: "entitlements", id: customerEntitlement.entitlement_id });
		add({ table: "features", id: customerEntitlement.internal_feature_id });
	}

	return [...keysByString.values()].sort(compareCatalogKeys);
};

export const catalogRowsToCatalog = ({
	rows,
}: {
	rows: CatalogRow[];
}): Catalog => {
	const catalog: Catalog = { entitlements: {}, products: {}, features: {} };
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
		}
	}
	return parseCatalog({ input: catalog });
};
