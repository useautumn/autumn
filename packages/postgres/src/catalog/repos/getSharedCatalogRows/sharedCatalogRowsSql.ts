import { type SQL, sql } from "drizzle-orm";
import type { PostgresContext } from "../../../types/postgresClient.js";
import { planLicenseCatalogRowsSql } from "../getCatalogRows/planLicenseCatalogRowsSql.js";

/**
 * Every catalog row of one org in one env that is not one customer's own, in one statement.
 * Entitlements, prices and free trials carry no env, so they are scoped by the product they belong to.
 */
export const sharedCatalogRowsSql = ({
	ctx,
}: {
	ctx: Pick<PostgresContext, "orgId" | "env">;
}): SQL => sql`
	SELECT json_build_object(
		'entitlements', COALESCE(
			(SELECT json_agg(row_to_json(e) ORDER BY e.id)
				FROM entitlements e
				JOIN products p ON p.internal_id = e.internal_product_id
				WHERE p.org_id = ${ctx.orgId}
					AND p.env = ${ctx.env}
					AND e.is_custom IS NOT TRUE),
			'[]'::json
		),
		'products', COALESCE(
			(SELECT json_agg(row_to_json(p) ORDER BY p.internal_id)
				FROM products p
				WHERE p.org_id = ${ctx.orgId}
					AND p.env = ${ctx.env}),
			'[]'::json
		),
		'features', COALESCE(
			(SELECT json_agg(row_to_json(f) ORDER BY f.internal_id)
				FROM features f
				WHERE f.org_id = ${ctx.orgId}
					AND f.env = ${ctx.env}),
			'[]'::json
		),
		'prices', COALESCE(
			(SELECT json_agg(row_to_json(pr) ORDER BY pr.id)
				FROM prices pr
				JOIN products p ON p.internal_id = pr.internal_product_id
				WHERE p.org_id = ${ctx.orgId}
					AND p.env = ${ctx.env}
					AND pr.is_custom IS NOT TRUE),
			'[]'::json
		),
		'plan_licenses', COALESCE(
			(${planLicenseCatalogRowsSql({ orgId: ctx.orgId, env: ctx.env, planLicenseIds: sql`(SELECT id FROM plan_license)` })}),
			'[]'::json
		),
		'free_trials', COALESCE(
			(SELECT json_agg(
				to_jsonb(ft.*) || jsonb_build_object('org_id', p.org_id, 'env', p.env)
				ORDER BY ft.id
			)
				FROM free_trials ft
				JOIN products p ON p.internal_id = ft.internal_product_id
				WHERE p.org_id = ${ctx.orgId}
					AND p.env = ${ctx.env}
					AND ft.is_custom IS NOT TRUE),
			'[]'::json
		)
	) AS envelope
`;
