import { type SQL, sql } from "drizzle-orm";
import type { PostgresContext } from "../../../types/postgresClient.js";
import type { CatalogRowIds } from "../../types/catalogRowsEnvelope.js";

/** Three by-key lookups in one statement. Entitlements carry no env column, so the org scope is their safety net. */
// sql.param keeps each id list one array parameter; a bare array would expand into a row constructor.
export const catalogRowsSql = ({
	ctx,
	ids,
}: {
	ctx: Pick<PostgresContext, "orgId" | "env">;
	ids: CatalogRowIds;
}): SQL => sql`
	SELECT json_build_object(
		'entitlements', COALESCE(
			(SELECT json_agg(row_to_json(e) ORDER BY e.id)
				FROM entitlements e
				WHERE e.org_id = ${ctx.orgId}
					AND e.id = ANY(${sql.param(ids.entitlementIds)}::text[])),
			'[]'::json
		),
		'products', COALESCE(
			(SELECT json_agg(row_to_json(p) ORDER BY p.internal_id)
				FROM products p
				WHERE p.org_id = ${ctx.orgId}
					AND p.env = ${ctx.env}
					AND p.internal_id = ANY(${sql.param(ids.productInternalIds)}::text[])),
			'[]'::json
		),
		'features', COALESCE(
			(SELECT json_agg(row_to_json(f) ORDER BY f.internal_id)
				FROM features f
				WHERE f.org_id = ${ctx.orgId}
					AND f.env = ${ctx.env}
					AND f.internal_id = ANY(${sql.param(ids.featureInternalIds)}::text[])),
			'[]'::json
		)
	) AS envelope
`;
