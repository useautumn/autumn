import { type SQL, sql } from "drizzle-orm";

/** Each plan license with the ids of its effective items: the customized overlay's, else the license product's base items. */
export const planLicenseCatalogRowsSql = ({
	orgId,
	env,
	planLicenseIds,
}: {
	orgId: string;
	env: string;
	planLicenseIds: SQL;
}): SQL => sql`
	SELECT json_agg(
		to_jsonb(pl.*) || jsonb_build_object(
			'org_id', license_product.org_id,
			'env', license_product.env,
			'price_ids', price_items.price_ids,
			'entitlement_ids', entitlement_items.entitlement_ids,
			'internal_feature_ids', entitlement_items.internal_feature_ids
		)
		ORDER BY pl.id
	)
	FROM plan_license pl
	JOIN products license_product
		ON license_product.internal_id = pl.license_internal_product_id
	CROSS JOIN LATERAL (
		SELECT COALESCE(jsonb_agg(item.id ORDER BY item.id), '[]'::jsonb) AS price_ids
		FROM (
			SELECT pr.id
			FROM license_prices lp
			JOIN prices pr ON pr.id = lp.price_id
			WHERE pl.customized AND lp.plan_license_id = pl.id
			UNION ALL
			SELECT pr.id
			FROM prices pr
			WHERE NOT pl.customized
				AND pr.internal_product_id = pl.license_internal_product_id
				AND pr.is_custom = false
		) item
	) price_items
	CROSS JOIN LATERAL (
		SELECT
			COALESCE(jsonb_agg(item.id ORDER BY item.id), '[]'::jsonb) AS entitlement_ids,
			COALESCE(jsonb_agg(DISTINCT item.internal_feature_id), '[]'::jsonb) AS internal_feature_ids
		FROM (
			SELECT e.id, e.internal_feature_id
			FROM license_entitlements le
			JOIN entitlements e ON e.id = le.entitlement_id
			WHERE pl.customized AND le.plan_license_id = pl.id
			UNION ALL
			SELECT e.id, e.internal_feature_id
			FROM entitlements e
			WHERE NOT pl.customized
				AND e.internal_product_id = pl.license_internal_product_id
				AND e.is_custom = false
		) item
	) entitlement_items
	WHERE license_product.org_id = ${orgId}
		AND license_product.env = ${env}
		AND pl.id IN ${planLicenseIds}
`;
