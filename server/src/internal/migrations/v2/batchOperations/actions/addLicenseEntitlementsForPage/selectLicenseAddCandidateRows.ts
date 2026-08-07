import { CusProductStatus, MIGRATABLE_STATUSES } from "@autumn/shared";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { sqlList } from "@/internal/billing/v2/actions/batchTransition/execute/sql/batchTransitionSqlUtils.js";
import type { OperationScope } from "../../scope/operationScope.js";
import { operationScopeSql } from "../../scope/operationScope.js";

const nullableNumeric = z.preprocess(
	(value) => (value === null || value === undefined ? null : Number(value)),
	z.number().nullable(),
);

const CandidateRowSchema = z.object({
	customerProductId: z.string(),
	internalCustomerId: z.string(),
	customerId: z.string().nullable(),
	entityId: z.string().nullable(),
	internalEntityId: z.string().nullable(),
	entitlementId: z.string(),
	internalFeatureId: z.string(),
	featureId: z.string(),
	status: z.enum(CusProductStatus),
	startsAt: nullableNumeric,
	canceledAt: nullableNumeric,
	endedAt: nullableNumeric,
	trialEndsAt: nullableNumeric,
});

export type LicenseCandidateRow = z.infer<typeof CandidateRowSchema>;

/**
 * Live assignments whose pool anchors a customized link carrying this feature.
 * Matched on the license product too, not just the feature — a parent may hold
 * links to several license plans, and their definitions can share a feature.
 * The parent is aliased `cp` so the plan filter's lowered scope applies to it —
 * assignments own no lifecycle, so status must come from the parent too.
 */
export const selectLicenseAddCandidateRows = async ({
	db,
	internalCustomerIds,
	scope,
	internalFeatureId,
	licenseInternalProductId,
	afterCustomerProductId,
	limit,
}: {
	db: DrizzleCli;
	internalCustomerIds: string[];
	scope: OperationScope;
	internalFeatureId: string;
	licenseInternalProductId: string;
	afterCustomerProductId?: string;
	limit: number;
}): Promise<LicenseCandidateRow[]> => {
	if (internalCustomerIds.length === 0) return [];

	const rows = await db.execute(sql`
		SELECT
			assignment.id AS "customerProductId",
			assignment.internal_customer_id AS "internalCustomerId",
			customer.id AS "customerId",
			entity.id AS "entityId",
			assignment.internal_entity_id AS "internalEntityId",
			e.id AS "entitlementId",
			e.internal_feature_id AS "internalFeatureId",
			f.id AS "featureId",
			assignment.status AS "status",
			assignment.starts_at AS "startsAt",
			assignment.canceled_at AS "canceledAt",
			assignment.ended_at AS "endedAt",
			assignment.trial_ends_at AS "trialEndsAt"
		FROM customer_products AS assignment
		JOIN LATERAL (
			SELECT pool.*
			FROM customer_licenses AS pool
			JOIN customer_products AS pool_parent
				ON pool_parent.id = pool.parent_customer_product_id
			WHERE pool.link_id = assignment.customer_license_link_id
				AND pool.license_internal_product_id = ${licenseInternalProductId}
			ORDER BY (pool_parent.status IN (${sqlList({ values: [...MIGRATABLE_STATUSES] })})) DESC,
				pool.created_at DESC
			LIMIT 1
		) AS pool ON true
		INNER JOIN customer_products AS cp
			ON cp.id = pool.parent_customer_product_id
		INNER JOIN license_entitlements AS le
			ON le.plan_license_id = pool.plan_license_id
		INNER JOIN entitlements AS e
			ON e.id = le.entitlement_id
		INNER JOIN features AS f
			ON f.internal_id = e.internal_feature_id
		INNER JOIN customers AS customer
			ON customer.internal_id = assignment.internal_customer_id
		LEFT JOIN entities AS entity
			ON entity.internal_id = assignment.internal_entity_id
		WHERE assignment.internal_customer_id = ANY(${sql.param(internalCustomerIds)}::text[])
			AND assignment.internal_entity_id IS NOT NULL
			AND assignment.status IN (${sqlList({ values: [...MIGRATABLE_STATUSES] })})
			AND e.internal_feature_id = ${internalFeatureId}
			AND ${operationScopeSql({ scope })}
			${afterCustomerProductId ? sql`AND assignment.id > ${afterCustomerProductId}` : sql``}
			AND NOT EXISTS (
				SELECT 1
				FROM customer_entitlements AS existing
				WHERE existing.customer_product_id = assignment.id
					AND existing.internal_feature_id = e.internal_feature_id
			)
		ORDER BY assignment.id
		LIMIT ${limit}
	`);

	return rows.map((row) => CandidateRowSchema.parse(row));
};
