import type {
	AppEnv,
	CusProductStatus,
	ListEntitiesParams,
} from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";

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

export const planScopeJoinSql = sql`
	JOIN plan_scopes ps
		ON ps.internal_customer_id = e.internal_customer_id
		AND (
			ps.internal_entity_id IS NULL
			OR ps.internal_entity_id = e.internal_id
		)
`;
