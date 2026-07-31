import type {
	AppEnv,
	CusProductStatus,
	ListEntitiesParams,
} from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";

/**
 * Resolving the plan filter as a correlated EXISTS re-probes customer_products
 * for every entity in the org — 197M buffer reads / 176s to return 20 rows on
 * mintlify, because the LIMIT can't push through the per-row subquery.
 *
 * Instead resolve which (customer, entity-scope) pairs match the plan ONCE, then
 * drive the entity scan from that (much smaller) set.
 *
 * Scopes are built so each entity matches at most one row — a customer-level
 * match covers all of that customer's entities, so its entity-level rows are
 * redundant and are dropped. That keeps the join 1:1 and avoids a DISTINCT that
 * would force materialising every match before ORDER BY / LIMIT.
 */
export const buildPlanScopeCte = ({
	orgId,
	env,
	plans,
	inStatuses,
}: {
	orgId: string;
	env: AppEnv;
	plans: NonNullable<ListEntitiesParams["plans"]>;
	inStatuses: CusProductStatus[];
}): SQL => {
	const planConditions = plans.map((plan) =>
		plan.versions && plan.versions.length > 0
			? sql`(p.id = ${plan.id} AND p.version IN (${sql.join(
					plan.versions.map((version) => sql`${version}`),
					sql`, `,
				)}))`
			: sql`p.id = ${plan.id}`,
	);

	return sql`
		plan_matched_products AS (
			SELECT cp.internal_customer_id, cp.internal_entity_id
			FROM customer_products cp
			JOIN products p
				ON p.internal_id = cp.internal_product_id
			WHERE p.org_id = ${orgId}
				AND p.env = ${env}
				AND cp.status = ANY(ARRAY[${sql.join(
					inStatuses.map((status) => sql`${status}`),
					sql`, `,
				)}])
				AND (${sql.join(planConditions, sql` OR `)})
		),

		plan_matched_customers AS (
			SELECT DISTINCT internal_customer_id
			FROM plan_matched_products
			WHERE internal_entity_id IS NULL
		),

		plan_scopes AS (
			SELECT internal_customer_id, NULL::text AS internal_entity_id
			FROM plan_matched_customers

			UNION ALL

			SELECT DISTINCT pmp.internal_customer_id, pmp.internal_entity_id
			FROM plan_matched_products pmp
			WHERE pmp.internal_entity_id IS NOT NULL
				AND NOT EXISTS (
					SELECT 1
					FROM plan_matched_customers pmc
					WHERE pmc.internal_customer_id = pmp.internal_customer_id
				)
		),
	`;
};

/** Drives the entity scan from plan_scopes rather than probing per entity. */
export const planScopeJoinSql = sql`
	JOIN plan_scopes ps
		ON ps.internal_customer_id = e.internal_customer_id
		AND (
			ps.internal_entity_id IS NULL
			OR ps.internal_entity_id = e.internal_id
		)
`;
