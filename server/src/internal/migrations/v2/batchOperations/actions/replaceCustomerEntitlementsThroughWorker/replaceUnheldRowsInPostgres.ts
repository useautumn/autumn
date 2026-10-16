import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { BatchMigrationExecutionPatch } from "@/internal/migrations/v2/batchOperations/types/index.js";
import { applyReplacePatches } from "../replaceCustomerEntitlementsForPage/applyReplacePatches.js";
import { customerEntitlementPatchKey } from "../utils/groupFilterReplaceRows.js";
import type { ReplaceWorkerRow } from "./types/replaceWorkerRow.js";

const groupByWrite = ({
	rows,
}: {
	rows: ReplaceWorkerRow[];
}): ReplaceWorkerRow[][] => {
	const groups = new Map<string, ReplaceWorkerRow[]>();
	for (const row of rows) {
		const key = `${row.replace.entitlement.id}|${customerEntitlementPatchKey({ patch: row.customerEntitlementPatch })}`;
		groups.set(key, [...(groups.get(key) ?? []), row]);
	}
	return [...groups.values()];
};

export const replaceUnheldRowsInPostgres = async ({
	ctx,
	patch,
	rows,
}: {
	ctx: AutumnContext;
	patch: BatchMigrationExecutionPatch;
	rows: ReplaceWorkerRow[];
}): Promise<ReplaceWorkerRow[]> => {
	const updatedIds = new Set<string>();
	for (const group of groupByWrite({ rows })) {
		const [first] = group;
		const { updatedIds: groupUpdatedIds } = await applyReplacePatches({
			db: ctx.db,
			rows: group,
			scope: patch.scope,
			toEntitlement: first.replace.entitlement,
			customerEntitlementPatch: first.customerEntitlementPatch,
		});
		for (const id of groupUpdatedIds) updatedIds.add(id);
	}
	return rows.filter((row) => updatedIds.has(row.customerEntitlementId));
};
