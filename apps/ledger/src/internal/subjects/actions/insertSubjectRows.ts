import type { SqliteContext } from "../../../sqlite/common/types/sqliteContext.js";
import { customerEntitlementStore } from "../../../sqlite/customerEntitlements/store/customerEntitlementStore.js";
import { customerProductStore } from "../../../sqlite/customerProducts/store/customerProductStore.js";
import { customerStore } from "../../../sqlite/customers/store/customerStore.js";
import { entitlementStore } from "../../../sqlite/entitlements/store/entitlementStore.js";
import { featureStore } from "../../../sqlite/features/store/featureStore.js";
import { productStore } from "../../../sqlite/products/store/productStore.js";
import { subjectVersionStore } from "../../../sqlite/subjectVersions/store/subjectVersionStore.js";
import { normalizeCustomerEntitlementRow } from "../normalize/normalizeCustomerEntitlementRow.js";
import { normalizeCustomerProductRow } from "../normalize/normalizeCustomerProductRow.js";
import { normalizeCustomerRow } from "../normalize/normalizeCustomerRow.js";
import { normalizeEntitlementRow } from "../normalize/normalizeEntitlementRow.js";
import { normalizeFeatureRow } from "../normalize/normalizeFeatureRow.js";
import { normalizeProductRow } from "../normalize/normalizeProductRow.js";
import type { SubjectImport } from "../types/subjectImport.js";

// A re-import replaces the customer's rows outright, so a product or balance
// Postgres no longer has stops existing here too.
const clearCustomerRows = ({
	ctx,
	internalCustomerId,
}: {
	ctx: SqliteContext;
	internalCustomerId: string;
}): void => {
	customerEntitlementStore.deleteByInternalCustomerId({
		ctx,
		internalCustomerId,
	});
	customerProductStore.deleteByInternalCustomerId({ ctx, internalCustomerId });
	customerStore.deleteByInternalId({ ctx, internalCustomerId });
};

// The only place a postgres row is normalised: the mirror stores model-shaped
// rows so a fold reads them without fixing anything up.
export const insertSubjectRows = ({
	ctx,
	imported,
}: {
	ctx: SqliteContext;
	imported: SubjectImport;
}): void => {
	const featureIdByInternalId = new Map(
		imported.features.map((row) => [row.internal_id, row.id]),
	);
	const productIdByInternalId = new Map(
		imported.products.map((row) => [row.internal_id, row.id]),
	);

	clearCustomerRows({ ctx, internalCustomerId: imported.internalCustomerId });

	// Catalog rows are shared across this shard's customers and stay insert-once;
	// a catalog edit lands when its plan becomes a command.
	featureStore.insertMany({
		ctx,
		rows: imported.features.map((row) => normalizeFeatureRow({ row })),
	});
	productStore.insertMany({
		ctx,
		rows: imported.products.map((row) => normalizeProductRow({ row })),
	});
	entitlementStore.insertMany({
		ctx,
		rows: imported.entitlements.map((row) => normalizeEntitlementRow({ row })),
	});
	customerStore.insertMany({
		ctx,
		rows: imported.customers.map((row) => normalizeCustomerRow({ row })),
	});
	customerProductStore.insertMany({
		ctx,
		rows: imported.customerProducts.map((row) =>
			normalizeCustomerProductRow({ row, productIdByInternalId }),
		),
	});
	customerEntitlementStore.insertMany({
		ctx,
		rows: imported.customerEntitlements.map((row) =>
			normalizeCustomerEntitlementRow({ row, featureIdByInternalId }),
		),
	});
	subjectVersionStore.seedVersion({
		ctx,
		internalCustomerId: imported.internalCustomerId,
		version: imported.version,
	});
};
