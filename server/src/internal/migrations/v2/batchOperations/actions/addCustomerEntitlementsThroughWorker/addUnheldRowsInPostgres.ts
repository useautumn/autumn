import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { BatchMigrationExecutionPatch } from "@/internal/migrations/v2/batchOperations/types/index.js";
import { insertCustomerEntitlementRows } from "../addCustomerEntitlementsForPage/insertCustomerEntitlementRows.js";
import type { AddWorkerRow } from "./types/addWorkerRow.js";

const groupByAdd = ({ rows }: { rows: AddWorkerRow[] }): AddWorkerRow[][] => {
	const groups = new Map<string, AddWorkerRow[]>();
	for (const row of rows) {
		const key = row.add.entitlement.id;
		groups.set(key, [...(groups.get(key) ?? []), row]);
	}
	return [...groups.values()];
};

export const addUnheldRowsInPostgres = async ({
	ctx,
	patch,
	rows,
	now,
}: {
	ctx: AutumnContext;
	patch: BatchMigrationExecutionPatch;
	rows: AddWorkerRow[];
	now: number;
}): Promise<AddWorkerRow[]> => {
	const insertedIds = new Set<string>();
	for (const group of groupByAdd({ rows })) {
		const { add } = group[0];
		const groupInsertedIds = await insertCustomerEntitlementRows({
			db: ctx.db,
			scope: patch.scope,
			entitlement: add.entitlement,
			initialState: add.initialState,
			rows: group,
			now,
			invoiceCredit: add.invoiceCredit ?? false,
		});
		for (const id of groupInsertedIds) insertedIds.add(id);
	}
	return rows.filter((row) => insertedIds.has(row.id));
};
