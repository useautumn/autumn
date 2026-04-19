import { sql } from "drizzle-orm";

/**
 * Builds customer-level entity aggregate CTEs for prepaid grant inferred from
 * `customer_products.options`, following the same shape as
 * `cusEntsToPrepaidQuantity`:
 * - match option -> customer entitlement by feature id/internal feature id
 * - resolve prepaid customer price for that entitlement
 * - compute quantity * billing_units
 *
 * NOTE: intentionally does not multiply by `ce.entities` key count yet.
 */
export const getEntityOptionsAggregateFragments = () => {
	const ctes = sql`
		entity_option_rows AS (
			SELECT
				ecp.internal_customer_id,
				ecp.id AS customer_product_id,
				NULLIF(option_row.option_value->>'internal_feature_id', '') AS option_internal_feature_id,
				NULLIF(option_row.option_value->>'feature_id', '') AS option_feature_id,
				COALESCE((option_row.option_value->>'quantity')::numeric, 0) AS option_quantity
			FROM entity_cus_products_for_options ecp
			CROSS JOIN LATERAL unnest(
				COALESCE(ecp.options, ARRAY[]::jsonb[])
			) AS option_row(option_value)
		),

		entity_option_prepaid_rows AS (
			SELECT
				ce.internal_feature_id,
				ce.internal_customer_id,
				eor.option_quantity,
				COALESCE((prepaid_price.config->>'billing_units')::numeric, 1) AS billing_units,
				eor.option_quantity
					* COALESCE((prepaid_price.config->>'billing_units')::numeric, 1)
					AS prepaid_grant
			FROM entity_option_rows eor
			JOIN customer_entitlements ce
				ON ce.customer_product_id = eor.customer_product_id
			JOIN entitlements ent
				ON ent.id = ce.entitlement_id
			JOIN LATERAL (
				SELECT
					p.config
				FROM customer_prices cpr
				JOIN prices p
					ON p.id = cpr.price_id
				WHERE cpr.customer_product_id = ce.customer_product_id
					AND p.entitlement_id = ce.entitlement_id
					AND (
						p.billing_type = 'usage_in_advance'
						OR p.config->>'bill_when' IN ('in_advance', 'start_of_period')
					)
				ORDER BY
					cpr.created_at DESC
				LIMIT 1
			) prepaid_price ON true
			WHERE
				(
					eor.option_internal_feature_id IS NOT NULL
					AND ce.internal_feature_id = eor.option_internal_feature_id
				)
				OR (
					eor.option_feature_id IS NOT NULL
					AND (
						ent.feature_id = eor.option_feature_id
						OR ce.feature_id = eor.option_feature_id
					)
				)
		),

		entity_prepaid_grant_from_options AS (
			SELECT
				internal_feature_id,
				internal_customer_id,
				SUM(prepaid_grant) AS prepaid_grant_from_options
			FROM entity_option_prepaid_rows
			GROUP BY internal_feature_id, internal_customer_id
		)
	`;

	return {
		ctes,
	};
};

