import type { EntitlementWithFeature } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { customerProductsScopeFilter } from "@/internal/migrations/v2/batchOperations/execute/sql/customerProductsScopeFilter.js";
import type { CustomerEntitlementInitialState } from "@/internal/migrations/v2/batchOperations/types/index.js";
import type { EnrichedCycleCandidate } from "@/internal/migrations/v2/batchOperations/utils/enrichCustomerEntitlementCycles.js";

export type InsertableCustomerEntitlementRow = EnrichedCycleCandidate & {
	id: string;
};

/** One set-based insert from the enriched rows (jsonb_to_recordset — no
 * param-limit blowup). Replay-idempotent via the caller's dedup select. */
export const insertCustomerEntitlementRows = async ({
	db,
	fromInternalProductId,
	entitlement,
	initialState,
	rows,
	now,
}: {
	db: DrizzleCli;
	fromInternalProductId: string;
	entitlement: EntitlementWithFeature;
	initialState: CustomerEntitlementInitialState;
	rows: InsertableCustomerEntitlementRow[];
	now: number;
}): Promise<number> => {
	if (rows.length === 0) return 0;

	const internalCustomerIds = [
		...new Set(rows.map((row) => row.internalCustomerId)),
	];

	const serializedRows = JSON.stringify(
		rows.map((row) => ({
			id: row.id,
			customer_product_id: row.customerProductId,
			internal_customer_id: row.internalCustomerId,
			customer_id: row.customerId,
			reset_cycle_anchor: row.resetCycleAnchor,
			next_reset_at: row.nextResetAt,
		})),
	);

	const [result] = await db.execute<{ affected: number }>(sql`
		WITH new_rows AS (
			SELECT *
			FROM JSONB_TO_RECORDSET(${serializedRows}::jsonb) AS r(
				id text,
				customer_product_id text,
				internal_customer_id text,
				customer_id text,
				reset_cycle_anchor numeric,
				next_reset_at numeric
			)
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
				new_row.id,
				new_row.customer_product_id,
				${entitlement.id},
				new_row.internal_customer_id,
				NULL,
				${entitlement.internal_feature_id},
				${initialState.unlimited},
				${initialState.granted},
				${now},
				new_row.reset_cycle_anchor,
				new_row.next_reset_at,
				false,
				false,
				0,
				0,
				NULL,
				NULL,
				0,
				new_row.customer_id,
				${entitlement.feature.id},
				NULL
			FROM new_rows AS new_row
			-- Re-assert scope at insert time: rows whose customer product
			-- changed since the select (canceled, customized) drop out.
			INNER JOIN customer_products AS cp
				ON cp.id = new_row.customer_product_id
				AND ${customerProductsScopeFilter({ internalCustomerIds, fromInternalProductId })}
			ON CONFLICT (id) DO NOTHING
			RETURNING 1
		)
		SELECT COUNT(*)::int AS affected FROM inserted
	`);

	return result?.affected ?? 0;
};
