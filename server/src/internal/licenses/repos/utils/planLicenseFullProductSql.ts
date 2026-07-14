import { sql } from "drizzle-orm";

/**
 * jsonb fragment building a plan license's effective FullProduct: the link's
 * license_entitlements/license_prices item overlay when `customized`, else
 * the product's base (non-custom) items. Aliases must be trusted literals
 * and not collide with lp/pr/le/e/f.
 */
export const planLicenseFullProductJson = ({
	planLicenseAlias,
	productAlias,
}: {
	planLicenseAlias: string;
	productAlias: string;
}) => {
	const planLicense = sql.raw(planLicenseAlias);
	const product = sql.raw(productAlias);
	return sql`to_jsonb(${product}.*) || jsonb_build_object(
		'prices',
		CASE
			WHEN ${planLicense}.customized THEN (
				SELECT COALESCE(jsonb_agg(to_jsonb(pr.*)), '[]'::jsonb)
				FROM license_prices lp
				JOIN prices pr ON pr.id = lp.price_id
				WHERE lp.plan_license_id = ${planLicense}.id
			)
			ELSE (
				SELECT COALESCE(jsonb_agg(to_jsonb(pr.*)), '[]'::jsonb)
				FROM prices pr
				WHERE pr.internal_product_id = ${product}.internal_id
					AND pr.is_custom = false
			)
		END,
		'entitlements',
		CASE
			WHEN ${planLicense}.customized THEN (
				SELECT COALESCE(
					jsonb_agg(to_jsonb(e.*) || jsonb_build_object('feature', to_jsonb(f.*))),
					'[]'::jsonb
				)
				FROM license_entitlements le
				JOIN entitlements e ON e.id = le.entitlement_id
				JOIN features f ON f.internal_id = e.internal_feature_id
				WHERE le.plan_license_id = ${planLicense}.id
			)
			ELSE (
				SELECT COALESCE(
					jsonb_agg(to_jsonb(e.*) || jsonb_build_object('feature', to_jsonb(f.*))),
					'[]'::jsonb
				)
				FROM entitlements e
				JOIN features f ON f.internal_id = e.internal_feature_id
				WHERE e.internal_product_id = ${product}.internal_id
					AND e.is_custom = false
			)
		END,
		'free_trial', null
	)`;
};
