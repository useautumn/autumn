import { CusProductStatus, MIGRATABLE_STATUSES } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { sqlList } from "@/internal/billing/v2/actions/batchTransition/execute/sql/batchTransitionSqlUtils.js";
import type { CustomerEntitlementInitialState } from "../../types/index.js";
import type { LicenseCandidateRow } from "./selectLicenseAddCandidateRows.js";

export type InsertableLicenseRow = LicenseCandidateRow & { id: string };

/**
 * Set-based insert onto assignment rows. Entitlement fields ride the recordset
 * rather than binding as scalars: each customized link carries its own row.
 */
export const insertLicenseCustomerEntitlementRows = async ({
	db,
	rows,
	initialState,
	now,
}: {
	db: DrizzleCli;
	rows: InsertableLicenseRow[];
	initialState: CustomerEntitlementInitialState;
	now: number;
}): Promise<string[]> => {
	if (rows.length === 0) return [];

	const serializedRows = JSON.stringify(
		rows.map((row) => ({
			id: row.id,
			customer_product_id: row.customerProductId,
			internal_customer_id: row.internalCustomerId,
			customer_id: row.customerId,
			internal_entity_id: row.internalEntityId,
			entitlement_id: row.entitlementId,
			internal_feature_id: row.internalFeatureId,
			feature_id: row.featureId,
		})),
	);

	const inserted = await db.execute<{ id: string }>(sql`
		WITH new_rows AS (
			SELECT *
			FROM JSONB_TO_RECORDSET(${serializedRows}::jsonb) AS r(
				id text,
				customer_product_id text,
				internal_customer_id text,
				customer_id text,
				internal_entity_id text,
				entitlement_id text,
				internal_feature_id text,
				feature_id text
			)
		),
		inserted AS (
			INSERT INTO customer_entitlements (
				id, customer_product_id, entitlement_id, internal_customer_id,
				internal_entity_id, internal_feature_id, unlimited, balance,
				created_at, reset_cycle_anchor, next_reset_at, usage_allowed,
				separate_interval, adjustment, additional_balance, entities,
				expires_at, cache_version, customer_id, feature_id, external_id,
				expired
			)
			SELECT
				new_row.id,
				new_row.customer_product_id,
				new_row.entitlement_id,
				new_row.internal_customer_id,
				new_row.internal_entity_id,
				new_row.internal_feature_id,
				${initialState.unlimited},
				${initialState.granted},
				${now},
				NULL,
				NULL,
				false,
				false,
				0,
				0,
				NULL,
				NULL,
				0,
				new_row.customer_id,
				new_row.feature_id,
				NULL,
				(seat.status = ${CusProductStatus.Expired})
			FROM new_rows AS new_row
			-- Re-assert at insert time: assignments whose row changed since the
			-- select (released, expired) drop out.
			INNER JOIN customer_products AS seat
				ON seat.id = new_row.customer_product_id
				AND seat.customer_license_link_id IS NOT NULL
				AND seat.internal_entity_id IS NOT NULL
				AND seat.status IN (${sqlList({ values: [...MIGRATABLE_STATUSES] })})
			ON CONFLICT (id) DO NOTHING
			RETURNING id
		)
		SELECT id FROM inserted
	`);

	return inserted.map((row) => row.id);
};
