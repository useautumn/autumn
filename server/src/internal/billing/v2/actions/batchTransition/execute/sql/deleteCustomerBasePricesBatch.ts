import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { RemoveBasePriceOperation } from "../../types/basePriceOperationTypes";
import type { BatchMutationResult } from "../../types/types";
import { activeStatusesSql, sqlList } from "./batchTransitionSqlUtils";

export const deleteCustomerBasePricesBatch = async ({
	db,
	customerLicenseLinkId,
	operation,
	batchSize,
}: {
	db: DrizzleCli;
	customerLicenseLinkId: string;
	operation: RemoveBasePriceOperation;
	batchSize: number;
}): Promise<BatchMutationResult> => {
	const [result] = await db.execute<BatchMutationResult>(sql`
		WITH candidate_rows AS MATERIALIZED (
			SELECT customer_price.ctid AS target_ctid
			FROM customer_products AS seat
			INNER JOIN customer_prices AS customer_price
				ON customer_price.customer_product_id = seat.id
			WHERE seat.customer_license_link_id = ${customerLicenseLinkId}
				AND seat.internal_entity_id IS NOT NULL
				AND seat.status IN (${activeStatusesSql})
				AND customer_price.price_id IN (${sqlList({ values: operation.fromPriceIds })})
			ORDER BY seat.created_at, seat.id, customer_price.id
			FOR UPDATE OF customer_price
			LIMIT ${batchSize + 1}
		),
		target_rows AS MATERIALIZED (
			SELECT target_ctid
			FROM candidate_rows
			LIMIT ${batchSize}
		),
		deleted AS (
			DELETE FROM customer_prices AS customer_price
			USING target_rows
			WHERE customer_price.ctid = target_rows.target_ctid
			RETURNING 1
		)
		SELECT
			(SELECT COUNT(*)::int FROM deleted) AS affected,
			(SELECT COUNT(*) > ${batchSize} FROM candidate_rows) AS "hasMore"
	`);

	return result ?? { affected: 0, hasMore: false };
};
