import { type SQL, sql } from "drizzle-orm";
import type { PostgresContext } from "../../../types/postgresClient.js";
import { SUBJECT_ROW_LIMITS } from "./subjectRowLimits.js";

/**
 * Several entities of one customer in one read: the same rows the single-entity
 * query returns for each, one envelope per entity, joined laterally against the
 * base tables so each entity's rows come off its own index probes.
 */
export const entitySubjectRowsSql = ({
	ctx,
	customerId,
	entityIds,
	statuses,
	asOfTimestampMs,
}: {
	ctx: Pick<PostgresContext, "orgId" | "env">;
	customerId: string;
	entityIds: readonly string[];
	statuses: string[];
	asOfTimestampMs: number;
}): SQL => {
	if (
		entityIds.length === 0 ||
		entityIds.length > SUBJECT_ROW_LIMITS.entitiesPerLoad
	)
		throw new RangeError(
			`An entity load reads 1 to ${SUBJECT_ROW_LIMITS.entitiesPerLoad} entities, not ${entityIds.length}`,
		);
	const statusList = sql`string_to_array(${statuses.join(",")}, ',')`;
	const idList = sql`string_to_array(${entityIds.join(",")}, ',')`;
	const licenseParentIsLive = ({ alias }: { alias: SQL }) => sql`EXISTS (
					SELECT 1
					FROM customer_licenses cl
					JOIN customer_products parent ON parent.id = cl.parent_customer_product_id
					WHERE cl.link_id = ${alias}.customer_license_link_id
						AND cl.internal_customer_id = ${alias}.internal_customer_id
						AND parent.status = ANY(${statusList})
				)`;

	return sql`
	WITH customer_record AS (
		SELECT c.*
		FROM customers c
		WHERE c.org_id = ${ctx.orgId}
			AND c.env = ${ctx.env}
			AND (c.id = ${customerId} OR c.internal_id = ${customerId})
		ORDER BY (c.id = ${customerId}) DESC
		LIMIT 1
	),

	requested_entities AS (
		SELECT e.*
		FROM entities e
		WHERE e.org_id = ${ctx.orgId}
			AND e.internal_customer_id = (SELECT internal_id FROM customer_record)
			AND e.id = ANY(${idList})
			AND e.env = ${ctx.env}
		UNION ALL
		SELECT e.*
		FROM entities e
		WHERE e.internal_id = ANY(${idList})
			AND e.internal_customer_id = (SELECT internal_id FROM customer_record)
			AND NOT (e.id = ANY(${idList}))
		LIMIT ${SUBJECT_ROW_LIMITS.entitiesPerLoad}
	)

	SELECT COALESCE(
		json_agg(
			json_build_object(
				'customer', (SELECT row_to_json(c) FROM customer_record c),
				'entity', row_to_json(e),
				'customer_products', COALESCE(products.rows, '[]'::json),
				'customer_prices', COALESCE(prices.rows, '[]'::json),
				'customer_entitlements', COALESCE(grants.rows, '[]'::json),
				'rollovers', COALESCE(rollovers.rows, '[]'::json),
				'replaceables', COALESCE(replaceables.rows, '[]'::json),
				'usage_windows', COALESCE(windows.rows, '[]'::json),
				'pooled_balances', '[]'::json,
				'customer_licenses', '[]'::json,
				'open_locks', '[]'::json
			)
			ORDER BY e.id
		),
		'[]'::json
	) AS envelopes
	FROM requested_entities e
	LEFT JOIN LATERAL (
		SELECT
			json_agg(row_to_json(cp) ORDER BY cp.created_at DESC, cp.id) AS rows,
			array_agg(cp.id) AS ids
		FROM (
			SELECT cp.*
			FROM customer_products cp
			JOIN products prod ON prod.internal_id = cp.internal_product_id
			WHERE cp.internal_entity_id = e.internal_id
				AND (
					(cp.customer_license_link_id IS NULL AND cp.status = ANY(${statusList}))
					OR ${licenseParentIsLive({ alias: sql`cp` })}
				)
			ORDER BY
				EXISTS (SELECT 1 FROM customer_prices cpr WHERE cpr.customer_product_id = cp.id) DESC,
				prod.is_add_on ASC,
				cp.created_at DESC
			LIMIT ${SUBJECT_ROW_LIMITS.customerProducts}
		) cp
	) products ON TRUE
	LEFT JOIN LATERAL (
		SELECT json_agg(row_to_json(cpr) ORDER BY cpr.id) AS rows
		FROM customer_prices cpr
		WHERE cpr.customer_product_id = ANY(products.ids)
	) prices ON TRUE
	LEFT JOIN LATERAL (
		SELECT
			json_agg(row_to_json(ce) ORDER BY ce.id) AS rows,
			array_agg(ce.id) AS ids
		FROM (
			SELECT ce.*
			FROM customer_entitlements ce
			WHERE ce.customer_product_id = ANY(products.ids)
				AND ce.pooled_balance_id IS NULL
			UNION ALL
			SELECT loose.*
			FROM (
				SELECT ce.*
				FROM customer_entitlements ce
				WHERE ce.internal_entity_id = e.internal_id
					AND ce.customer_product_id IS NULL
					AND ce.pooled_balance_id IS NULL
					AND ce.pooled_contribution_id IS NULL
					AND (ce.expires_at IS NULL OR ce.expires_at > ${asOfTimestampMs})
					AND (
						ce.balance != 0
						OR ce.unlimited IS TRUE
						OR ce.next_reset_at IS NOT NULL
						OR EXISTS (
							SELECT 1
							FROM entitlements en
							JOIN features f ON f.internal_id = en.internal_feature_id
							WHERE en.id = ce.entitlement_id AND f.type = 'boolean'
						)
					)
				ORDER BY ce.id DESC
				LIMIT ${SUBJECT_ROW_LIMITS.looseCustomerEntitlements}
			) loose
		) ce
	) grants ON TRUE
	LEFT JOIN LATERAL (
		SELECT json_agg(row_to_json(ro) ORDER BY ro.expires_at ASC NULLS LAST, ro.id) AS rows
		FROM rollovers ro
		WHERE ro.cus_ent_id = ANY(grants.ids)
			AND (ro.expires_at IS NULL OR ro.expires_at > ${asOfTimestampMs})
	) rollovers ON TRUE
	LEFT JOIN LATERAL (
		SELECT json_agg(row_to_json(rep) ORDER BY rep.created_at ASC, rep.id) AS rows
		FROM replaceables rep
		WHERE rep.cus_ent_id = ANY(grants.ids)
	) replaceables ON TRUE
	LEFT JOIN LATERAL (
		SELECT json_agg(row_to_json(uw) ORDER BY uw.id) AS rows
		FROM usage_windows uw
		WHERE uw.internal_customer_id = e.internal_customer_id
			AND uw.internal_entity_id = e.internal_id
	) windows ON TRUE
`;
};
