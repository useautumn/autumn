import { sql } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { sqlList } from "@/internal/billing/v2/actions/batchTransition/execute/sql/batchTransitionSqlUtils.js";
import {
	type OperationScope,
	operationScopeSql,
} from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";
import type { RepointRow } from "./selectRepointRows.js";

export const repointUnheldRowsInPostgres = async ({
	ctx,
	scope,
	toInternalProductId,
	rows,
}: {
	ctx: AutumnContext;
	scope: OperationScope;
	toInternalProductId: string;
	rows: RepointRow[];
}): Promise<RepointRow[]> => {
	if (rows.length === 0) return [];
	const updated = await ctx.db.execute<{ id: string }>(sql`
		UPDATE customer_products AS cp
		SET internal_product_id = ${toInternalProductId}
		WHERE cp.id IN (${sqlList({ values: rows.map((row) => row.customerProductId) })})
			AND ${operationScopeSql({ scope })}
		RETURNING cp.id
	`);
	const updatedIds = new Set(updated.map(({ id }) => id));
	return rows.filter((row) => updatedIds.has(row.customerProductId));
};
