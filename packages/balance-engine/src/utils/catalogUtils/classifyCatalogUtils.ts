import type { Catalog } from "../../models/catalog/catalog.js";
import type { RowChange } from "../../models/mutation/rowChange.js";
import { isStructurallyEqual } from "../isStructurallyEqual.js";

/** The state tables whose rows name catalog rows: products, prices, entitlements and features, plan licenses. */
const CATALOG_REFERENCING_TABLES = new Set<string>([
	"customerProducts",
	"customerPrices",
	"customerEntitlements",
	"customerLicenses",
]);

/** An increment moves counters, never ids; so a mutation of increments and of other tables leaves the state's catalog keys as they were. */
export const changesKeepCatalogKeys = ({
	changes,
}: {
	changes: RowChange[];
}): boolean =>
	changes.every(
		(change) =>
			change.op === "increment" ||
			!CATALOG_REFERENCING_TABLES.has(change.table),
	);

export const isSameCatalog = ({
	left,
	right,
}: {
	left: Catalog;
	right: Catalog;
}): boolean => isStructurallyEqual(left, right);
