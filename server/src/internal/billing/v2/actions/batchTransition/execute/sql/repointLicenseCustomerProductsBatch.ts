import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { CustomerProductTransition } from "../../compute/transitions/computeCustomerProductTransition";
import type { BatchMutationResult } from "../../types/types";
import { activeStatusesSql } from "./batchTransitionSqlUtils";

export const repointLicenseCustomerProductsBatch = async ({
	db,
	customerLicenseLinkId,
	transition,
	batchSize,
}: {
	db: DrizzleCli;
	customerLicenseLinkId: string;
	transition: CustomerProductTransition;
	batchSize: number;
}): Promise<BatchMutationResult> => {
	const [result] = await db.execute<BatchMutationResult>(sql`
		WITH candidate_rows AS MATERIALIZED (
			SELECT seat.ctid AS target_ctid
			FROM customer_products AS seat
			WHERE seat.customer_license_link_id = ${customerLicenseLinkId}
				AND seat.internal_product_id = ${transition.fromInternalProductId}
				AND seat.internal_entity_id IS NOT NULL
				AND seat.status IN (${activeStatusesSql})
			ORDER BY seat.created_at, seat.id
			FOR UPDATE OF seat
			LIMIT ${batchSize + 1}
		),
		target_rows AS MATERIALIZED (
			SELECT target_ctid
			FROM candidate_rows
			LIMIT ${batchSize}
		),
		updated AS (
			UPDATE customer_products AS seat
			SET internal_product_id = ${transition.toInternalProductId}
			FROM target_rows
			WHERE seat.ctid = target_rows.target_ctid
			RETURNING 1
		)
		SELECT
			(SELECT COUNT(*)::int FROM updated) AS affected,
			(SELECT COUNT(*) > ${batchSize} FROM candidate_rows) AS "hasMore"
	`);

	return result ?? { affected: 0, hasMore: false };
};
