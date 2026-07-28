import { EntInterval, isBooleanEntitlement } from "@autumn/shared";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { BatchMigrationExecutionAdd } from "@/internal/migrations/v2/batchOperations/types/index.js";
import { generateId } from "@/utils/genUtils.js";
import { customerProductsScopeFilter } from "./customerProductsScopeFilter.js";

/**
 * Inserts one customer_entitlements row per candidate customer product. Two
 * statements: count candidates, then insert with that many pre-generated ids
 * zipped by ordinality (no param-limit blowup at page scale).
 *
 * Dedup is itemAlreadyExists parity evaluated against the customer's ACTUAL
 * rows: same feature (denormalized internal_feature_id) — feature-only for
 * booleans, same reset interval otherwise (via the entitlements definition).
 * This also makes replay idempotent: rows inserted by a previous attempt
 * match the probe on rerun.
 */
export const addCustomerEntitlementsForPage = async ({
	db,
	internalCustomerIds,
	fromInternalProductId,
	add,
	now,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	fromInternalProductId: string;
	add: BatchMigrationExecutionAdd;
	now: number;
}): Promise<number> => {
	const { entitlement, initialState } = add;

	const intervalCondition = isBooleanEntitlement({ entitlement })
		? sql``
		: sql`AND COALESCE(existing_definition.interval, ${EntInterval.Lifetime}) = ${String(entitlement.interval ?? EntInterval.Lifetime)}`;

	const candidateWhere = sql`
		${customerProductsScopeFilter({ internalCustomerIds, fromInternalProductId })}
		AND NOT EXISTS (
			SELECT 1
			FROM customer_entitlements AS existing
			INNER JOIN entitlements AS existing_definition
				ON existing_definition.id = existing.entitlement_id
			WHERE existing.customer_product_id = cp.id
				AND existing.internal_feature_id = ${entitlement.internal_feature_id}
				${intervalCondition}
		)
	`;

	const [countRow] = await db.execute<{ count: number }>(sql`
		SELECT COUNT(*)::int AS count
		FROM customer_products AS cp
		WHERE ${candidateWhere}
	`);
	const candidateCount = countRow?.count ?? 0;
	if (candidateCount === 0) return 0;

	const customerEntitlementIds = Array.from({ length: candidateCount }, () =>
		generateId("cus_ent"),
	);

	const [result] = await db.execute<{ affected: number }>(sql`
		WITH candidate_rows AS MATERIALIZED (
			SELECT
				cp.id,
				cp.internal_customer_id,
				ROW_NUMBER() OVER (ORDER BY cp.id) AS ordinal
			FROM customer_products AS cp
			WHERE ${candidateWhere}
			ORDER BY cp.id
			LIMIT ${candidateCount}
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
				candidate.id,
				${entitlement.id},
				candidate.internal_customer_id,
				NULL,
				${entitlement.internal_feature_id},
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
				customer.id,
				${entitlement.feature.id},
				NULL
			FROM candidate_rows AS candidate
			INNER JOIN generated_ids AS generated
				ON generated.ordinality = candidate.ordinal
			INNER JOIN customers AS customer
				ON customer.internal_id = candidate.internal_customer_id
			ON CONFLICT (id) DO NOTHING
			RETURNING 1
		)
		SELECT COUNT(*)::int AS affected FROM inserted
	`);

	return result?.affected ?? 0;
};
