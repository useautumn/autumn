import { type CatalogRow, toBillingPlanUpdateOp } from "@autumn/balance-engine";
import type { FullProductWithoutLicenses } from "@autumn/shared";
import type { WorkerMigrationPlan } from "@/internal/balanceWorker/migrationPlan/types/workerMigrationPlan.js";
import { entitlementCatalogRows } from "../throughWorker/entitlementCatalogRows.js";
import {
	expectedProductOf,
	ownerEntityIdsOf,
} from "../throughWorker/isHeldByWorker.js";
import type { RepointRow } from "./selectRepointRows.js";

const productCatalogRows = ({
	product,
}: {
	product: FullProductWithoutLicenses;
}): CatalogRow[] => [
	{ table: "products", row: product },
	...product.prices.map(
		(price): CatalogRow => ({ table: "prices", row: price }),
	),
	...entitlementCatalogRows({ entitlements: product.entitlements }),
];

export const repointRowsToMigrationPlan = ({
	rows,
	toProduct,
}: {
	rows: RepointRow[];
	toProduct: FullProductWithoutLicenses;
}): WorkerMigrationPlan => ({
	entityIds: ownerEntityIdsOf({ rows }),
	ops: rows.map((row) =>
		toBillingPlanUpdateOp({
			table: "customerProducts",
			id: row.customerProductId,
			set: { internal_product_id: toProduct.internal_id },
			expectProduct: expectedProductOf({ row }),
		}),
	),
	catalogRows: productCatalogRows({ product: toProduct }),
});
