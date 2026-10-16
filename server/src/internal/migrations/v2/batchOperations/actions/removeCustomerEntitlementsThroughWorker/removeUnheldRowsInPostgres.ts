import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { BatchMigrationExecutionPatch } from "@/internal/migrations/v2/batchOperations/types/index.js";
import { deleteCustomerEntitlementRows } from "../removeCustomerEntitlementsForPage/deleteCustomerEntitlementRows.js";
import type { RemoveCandidateRow } from "../removeCustomerEntitlementsForPage/selectRemoveCandidateRows.js";

export const removeUnheldRowsInPostgres = async ({
	ctx,
	patch,
	rows,
}: {
	ctx: AutumnContext;
	patch: BatchMigrationExecutionPatch;
	rows: RemoveCandidateRow[];
}): Promise<RemoveCandidateRow[]> => {
	if (rows.length === 0) return [];
	const deletedIds = new Set(
		await deleteCustomerEntitlementRows({
			db: ctx.db,
			rows,
			scope: patch.scope,
		}),
	);
	return rows.filter((row) => deletedIds.has(row.customerEntitlementId));
};
