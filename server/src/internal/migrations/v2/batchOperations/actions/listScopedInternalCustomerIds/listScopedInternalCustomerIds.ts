import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	type OperationScope,
	operationScopeSql,
} from "../../scope/operationScope.js";
import { pageCustomerIdsCte } from "../utils/pageCustomerIdsSql.js";

/** Which of the page's customers hold at least one customer product inside
 * any patch scope. A skipped customer outside every scope was ineligible;
 * one inside a scope had nothing left to change. */
export const listScopedInternalCustomerIds = async ({
	db,
	internalCustomerIds,
	scopes,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	scopes: OperationScope[];
}): Promise<Set<string>> => {
	if (internalCustomerIds.length === 0 || scopes.length === 0) return new Set();

	const scopeWhere = sql.join(
		scopes.map((scope) => operationScopeSql({ scope })),
		sql` OR `,
	);
	const rows = (await db.execute(sql`
		WITH ${pageCustomerIdsCte({ internalCustomerIds })}
		SELECT DISTINCT cp.internal_customer_id
		FROM page
		INNER JOIN customer_products AS cp
			ON cp.internal_customer_id = page.internal_customer_id
		WHERE (${scopeWhere})
	`)) as Array<{ internal_customer_id: string }>;

	return new Set(rows.map((row) => row.internal_customer_id));
};
