import type { RowChange } from "../../models/mutation/rowChange.js";

const CATALOG_REFERENCING_TABLES = new Set<string>([
	"customerProducts",
	"customerPrices",
	"customerEntitlements",
	"customerLicenses",
]);

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
