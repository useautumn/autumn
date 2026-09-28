import { type SQL, sql } from "drizzle-orm";
import type { PostgresContext } from "../../../types/postgresClient.js";
import type { CatalogRowIds } from "../../types/catalogRowsEnvelope.js";
import { planLicenseCatalogRowsSql } from "./planLicenseCatalogRowsSql.js";

/** Bun's driver flattens a JS array to "a,b" and JSON-encodes a string bound as jsonb, so the list travels as text. */
const idList = (ids: readonly string[]): SQL =>
	sql`(SELECT jsonb_array_elements_text(${JSON.stringify(ids)}::text::jsonb))`;

/** One by-key lookup per table in one statement. Entitlements and prices carry no env column, so the org scope is their safety net. */
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
					AND e.id IN ${idList(ids.entitlementIds)}),
			'[]'::json
		),
		'products', COALESCE(
			(SELECT json_agg(row_to_json(p) ORDER BY p.internal_id)
				FROM products p
				WHERE p.org_id = ${ctx.orgId}
					AND p.env = ${ctx.env}
					AND p.internal_id IN ${idList(ids.productInternalIds)}),
			'[]'::json
		),
		'features', COALESCE(
			(SELECT json_agg(row_to_json(f) ORDER BY f.internal_id)
				FROM features f
				WHERE f.org_id = ${ctx.orgId}
					AND f.env = ${ctx.env}
					AND f.internal_id IN ${idList(ids.featureInternalIds)}),
			'[]'::json
		),
		'prices', COALESCE(
			(SELECT json_agg(row_to_json(p) ORDER BY p.id)
				FROM prices p
				WHERE p.org_id = ${ctx.orgId}
					AND p.id IN ${idList(ids.priceIds)}),
			'[]'::json
		),
		'plan_licenses', COALESCE(
			(${planLicenseCatalogRowsSql({ orgId: ctx.orgId, env: ctx.env, planLicenseIds: idList(ids.planLicenseIds) })}),
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
					AND ft.id IN ${idList(ids.freeTrialIds)}),
			'[]'::json
		)
	) AS envelope
`;
