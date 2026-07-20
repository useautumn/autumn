import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AddEntitlementPriceOperation } from "../../types/entitlementPriceOperationTypes";
import type { BatchMutationResult } from "../../types/types";
import { activeStatusesSql, sqlList } from "./batchTransitionSqlUtils";

export const addCustomerEntitlementsBatch = async ({
	db,
	customerLicenseLinkId,
	assignmentCutoffMs,
	customerEntitlementIds,
	operation,
	batchSize,
}: {
	db: DrizzleCli;
	customerLicenseLinkId: string;
	assignmentCutoffMs: number;
	customerEntitlementIds: string[];
	operation: AddEntitlementPriceOperation;
	batchSize: number;
}): Promise<BatchMutationResult> => {
	if (operation.existingEntitlementIds.length === 0) {
		throw new Error("Customer entitlement addition requires candidate IDs");
	}
	if (customerEntitlementIds.length !== batchSize) {
		throw new Error("Customer entitlement addition requires one ID per row");
	}

	const customerEntitlement = operation.customerEntitlement;
	const [result] = await db.execute<BatchMutationResult>(sql`
		WITH candidate_rows AS MATERIALIZED (
			SELECT seat.id, seat.created_at
			FROM customer_products AS seat
			WHERE seat.customer_license_link_id = ${customerLicenseLinkId}
				AND seat.status IN (${activeStatusesSql})
				AND (seat.created_at IS NULL OR seat.created_at <= ${assignmentCutoffMs})
				AND NOT EXISTS (
					SELECT 1
					FROM customer_entitlements AS existing
					WHERE existing.customer_product_id = seat.id
						AND existing.entitlement_id IN (${sqlList({ values: operation.existingEntitlementIds })})
				)
			ORDER BY seat.created_at, seat.id
			FOR UPDATE OF seat
			LIMIT ${batchSize + 1}
		),
		target_rows AS MATERIALIZED (
			SELECT
				id,
				ROW_NUMBER() OVER (ORDER BY created_at, id) AS ordinal
			FROM candidate_rows
			LIMIT ${batchSize}
		),
		generated_ids AS MATERIALIZED (
			SELECT generated.id, generated.ordinality
			FROM JSONB_ARRAY_ELEMENTS_TEXT(${JSON.stringify(customerEntitlementIds)}::jsonb)
				WITH ORDINALITY AS generated(id, ordinality)
		),
		inserted AS (
			INSERT INTO customer_entitlements (
				id,
				customer_product_id,
				entitlement_id,
				internal_customer_id,
				internal_entity_id,
				internal_feature_id,
				unlimited,
				balance,
				created_at,
				reset_cycle_anchor,
				next_reset_at,
				usage_allowed,
				separate_interval,
				adjustment,
				additional_balance,
				entities,
				expires_at,
				cache_version,
				customer_id,
				feature_id,
				external_id
			)
			SELECT
				generated.id,
				target.id,
				${customerEntitlement.entitlement_id},
				${customerEntitlement.internal_customer_id},
				NULL,
				${customerEntitlement.internal_feature_id},
				${customerEntitlement.unlimited},
				${customerEntitlement.balance},
				${customerEntitlement.created_at},
				${customerEntitlement.reset_cycle_anchor},
				${customerEntitlement.next_reset_at},
				${customerEntitlement.usage_allowed},
				${customerEntitlement.separate_interval},
				${customerEntitlement.adjustment},
				${customerEntitlement.additional_balance},
				${customerEntitlement.entities ? JSON.stringify(customerEntitlement.entities) : null}::jsonb,
				${customerEntitlement.expires_at},
				${customerEntitlement.cache_version},
				${customerEntitlement.customer_id},
				${customerEntitlement.feature_id},
				${customerEntitlement.external_id}
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
