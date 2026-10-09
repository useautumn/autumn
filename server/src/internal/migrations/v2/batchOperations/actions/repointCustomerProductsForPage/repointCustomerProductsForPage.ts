import type { FullProductWithoutLicenses } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { withStatementTimeout } from "@/db/withStatementTimeout.js";
import type { RecordBatchMigrationChanges } from "../../execute/types/batchMigrationChanges.js";
import type { BatchMigrationRepointedProduct } from "../../execute/types/batchMigrationExecutionTypes.js";
import { BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS } from "../../execute/utils/batchMigrationExecutionConstants.js";
import type { OperationScope } from "../../scope/operationScope.js";
import { repointCustomerProductRows } from "./repointCustomerProductRows.js";

export const repointCustomerProductsForPage = ({
	db,
	recordChanges,
	internalCustomerIds,
	scope,
	toInternalProductId,
	fromProduct,
	toProduct,
}: {
	db: DrizzleCli;
	recordChanges: RecordBatchMigrationChanges;
	internalCustomerIds: string[];
	scope: OperationScope;
	toInternalProductId: string;
	fromProduct: FullProductWithoutLicenses;
	toProduct: FullProductWithoutLicenses;
}): Promise<BatchMigrationRepointedProduct[]> =>
	withStatementTimeout(
		db,
		async (transaction) => {
			const rows = await repointCustomerProductRows({
				db: transaction,
				internalCustomerIds,
				scope,
				toInternalProductId,
			});
			const repointedProducts = rows.map((row) => ({
				...row,
				fromProduct,
				toProduct,
			}));
			await recordChanges({ db: transaction, changes: { repointedProducts } });
			return repointedProducts;
		},
		BATCH_MIGRATION_PAGE_STATEMENT_TIMEOUT_MS,
		{ forceCustomPlan: true },
	);
