import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AddBasePriceOperation } from "../../types/basePriceOperationTypes";
import type { BatchMutationResult } from "../../types/types";
import { activeStatusesSql, sqlList } from "./batchTransitionSqlUtils";

export const addCustomerBasePricesBatch = async ({
	db,
	customerLicenseLinkId,
	assignmentCutoffMs,
	customerPriceIds,
	operation,
	batchSize,
}: {
	db: DrizzleCli;
	customerLicenseLinkId: string;
	assignmentCutoffMs: number;
	customerPriceIds: string[];
	operation: AddBasePriceOperation;
	batchSize: number;
}): Promise<BatchMutationResult> => {
	if (operation.existingBasePriceIds.length === 0) {
		throw new Error("Base price addition requires candidate IDs");
	}
	if (customerPriceIds.length !== batchSize) {
		throw new Error("Base price addition requires one ID per row");
	}

	const [result] = await db.execute<BatchMutationResult>(sql`
		WITH candidate_rows AS MATERIALIZED (
			SELECT seat.id, seat.internal_customer_id, seat.created_at
			FROM customer_products AS seat
			WHERE seat.customer_license_link_id = ${customerLicenseLinkId}
				AND seat.internal_entity_id IS NOT NULL
				AND seat.status IN (${activeStatusesSql})
				AND (seat.created_at IS NULL OR seat.created_at <= ${assignmentCutoffMs})
				AND NOT EXISTS (
					SELECT 1
					FROM customer_prices AS existing
					WHERE existing.customer_product_id = seat.id
						AND existing.price_id IN (${sqlList({ values: operation.existingBasePriceIds })})
				)
			ORDER BY seat.created_at, seat.id
			FOR UPDATE OF seat
			LIMIT ${batchSize + 1}
		),
		target_rows AS MATERIALIZED (
			SELECT
				id,
				internal_customer_id,
				ROW_NUMBER() OVER (ORDER BY created_at, id) AS ordinal
			FROM candidate_rows
			LIMIT ${batchSize}
		),
		generated_ids AS MATERIALIZED (
			SELECT generated.id, generated.ordinality
			FROM JSONB_ARRAY_ELEMENTS_TEXT(${JSON.stringify(customerPriceIds)}::jsonb)
				WITH ORDINALITY AS generated(id, ordinality)
		),
		inserted AS (
			INSERT INTO customer_prices (
				id,
				created_at,
				price_id,
				internal_customer_id,
				customer_product_id
			)
			SELECT
				generated.id,
				${assignmentCutoffMs},
				${operation.toPrice.id},
				target.internal_customer_id,
				target.id
			FROM target_rows AS target
			INNER JOIN generated_ids AS generated
				ON generated.ordinality = target.ordinal
			ON CONFLICT (id) DO NOTHING
			RETURNING 1
		)
		SELECT
			(SELECT COUNT(*)::int FROM inserted) AS affected,
			(
				(SELECT COUNT(*) > ${batchSize} FROM candidate_rows)
				OR
				(SELECT COUNT(*) FROM inserted) < (SELECT COUNT(*) FROM target_rows)
			) AS "hasMore"
	`);

	return result ?? { affected: 0, hasMore: false };
};
