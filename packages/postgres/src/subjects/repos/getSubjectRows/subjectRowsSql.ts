import { type SQL, sql } from "drizzle-orm";
import type { PostgresContext } from "../../../types/postgresClient.js";

/**
 * Single-customer port of getFullSubjectRowsQuery, keeping only what the balance
 * worker holds: customer-level products in the given statuses, their entitlements,
 * live loose entitlements, and unexpired rollovers. Catalog rows come from getCatalogRows.
 * Expiry is evaluated at `asOfTimestampMs` so a replay sees the same rows as the original.
 */
export const subjectRowsSql = ({
	ctx,
	customerId,
	statuses,
	asOfTimestampMs,
}: {
	ctx: Pick<PostgresContext, "orgId" | "env">;
	customerId: string;
	statuses: string[];
	asOfTimestampMs: number;
}): SQL => sql`
	WITH customer_record AS (
		SELECT c.*
		FROM customers c
		WHERE c.org_id = ${ctx.orgId}
			AND c.env = ${ctx.env}
			AND (c.id = ${customerId} OR c.internal_id = ${customerId})
		ORDER BY (c.id = ${customerId}) DESC
		LIMIT 1
	),

	cus_products AS (
		SELECT cp.*
		FROM customer_products cp
		WHERE cp.internal_customer_id IN (SELECT internal_id FROM customer_record)
			AND cp.internal_entity_id IS NULL
			AND cp.customer_license_link_id IS NULL
			AND cp.status = ANY(string_to_array(${statuses.join(",")}, ','))
	),

	product_entitlements AS (
		SELECT ce.*
		FROM customer_entitlements ce
		JOIN cus_products cp ON cp.id = ce.customer_product_id
		WHERE ce.pooled_balance_id IS NULL
			AND ce.pooled_contribution_id IS NULL
	),

	-- Same liveness rule as looseEntitlementIsLiveSql: a spendable balance, unlimited,
	-- a boolean flag, or a pending reset. Drained one-off grants drop out.
	loose_entitlements AS (
		SELECT ce.*
		FROM customer_entitlements ce
		WHERE ce.internal_customer_id IN (SELECT internal_id FROM customer_record)
			AND ce.customer_product_id IS NULL
			AND ce.internal_entity_id IS NULL
			AND ce.pooled_balance_id IS NULL
			AND ce.pooled_contribution_id IS NULL
			AND (ce.expires_at IS NULL OR ce.expires_at > ${asOfTimestampMs})
			AND (
				ce.balance != 0
				OR ce.unlimited IS TRUE
				OR ce.next_reset_at IS NOT NULL
				OR EXISTS (
					SELECT 1
					FROM entitlements e
					JOIN features f ON f.internal_id = e.internal_feature_id
					WHERE e.id = ce.entitlement_id AND f.type = 'boolean'
				)
			)
	),

	all_entitlements AS (
		SELECT * FROM product_entitlements
		UNION ALL
		SELECT * FROM loose_entitlements
	),

	cus_rollovers AS (
		SELECT ro.*
		FROM rollovers ro
		WHERE ro.cus_ent_id IN (SELECT id FROM all_entitlements)
			AND (ro.expires_at IS NULL OR ro.expires_at > ${asOfTimestampMs})
	)

	SELECT json_build_object(
		'customer', (SELECT row_to_json(c) FROM customer_record c),
		'customer_products', COALESCE(
			(SELECT json_agg(row_to_json(cp) ORDER BY cp.created_at DESC, cp.id) FROM cus_products cp),
			'[]'::json
		),
		'customer_entitlements', COALESCE(
			(SELECT json_agg(row_to_json(ce) ORDER BY ce.id) FROM all_entitlements ce),
			'[]'::json
		),
		'rollovers', COALESCE(
			(SELECT json_agg(row_to_json(ro) ORDER BY ro.expires_at ASC NULLS LAST, ro.id) FROM cus_rollovers ro),
			'[]'::json
		),
		'entities', '[]'::json
	) AS envelope
`;
