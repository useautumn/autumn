import { type SQL, sql } from "drizzle-orm";
import type { PostgresContext } from "../../../types/postgresClient.js";
import { SUBJECT_ROW_LIMITS } from "./subjectRowLimits.js";

/**
 * Single-subject port of getFullSubjectRowsQuery, keeping only what the balance worker
 * holds for one subject: its products in the given statuses, their prices and entitlements,
 * live loose entitlements, unexpired rollovers, replaceables, its usage-window counters, and the ids of its open locks. Customer-level rows
 * when no entity is named, else the entity's own rows. Catalog rows come from getCatalogRows.
 * Expiry is evaluated at `asOfTimestampMs` so a replay sees the same rows as the original.
 */
export const subjectRowsSql = ({
	ctx,
	customerId,
	entityId,
	statuses,
	asOfTimestampMs,
}: {
	ctx: Pick<PostgresContext, "orgId" | "env">;
	customerId: string;
	entityId: string | null;
	statuses: string[];
	asOfTimestampMs: number;
}): SQL => {
	const ownedBySubject = ({ alias }: { alias: SQL }) =>
		entityId === null
			? sql`${alias}.internal_entity_id IS NULL`
			: sql`${alias}.internal_entity_id IN (SELECT internal_id FROM entity_record)`;

	// A lock id is unique across the customer, so only the customer's own load carries open locks;
	// a pool is customer-level too, and an entity command reads it off the customer's state.
	const customerOwnedOnly = entityId === null ? sql`TRUE` : sql`FALSE`;
	const statusList = sql`string_to_array(${statuses.join(",")}, ',')`;
	// A seat or a license pool has no lifecycle of its own: the parent product behind its license link decides.
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

	entity_record AS (
		SELECT e.*
		FROM entities e
		WHERE e.internal_customer_id IN (SELECT internal_id FROM customer_record)
			AND (e.id = ${entityId} OR e.internal_id = ${entityId})
		ORDER BY (e.id = ${entityId}) DESC
		LIMIT 1
	),

	-- A seat's own status is a copy a cron refreshes later; the parent behind its license link is the truth.
	-- A spare seat (no entity yet) is nobody's to draw from, so it stays out of the customer's rows.
	subject_customer_products AS (
		SELECT cp.*
		FROM customer_products cp
		JOIN products prod ON prod.internal_id = cp.internal_product_id
		WHERE cp.internal_customer_id IN (SELECT internal_id FROM customer_record)
			AND ${ownedBySubject({ alias: sql`cp` })}
			AND (
				(cp.customer_license_link_id IS NULL AND cp.status = ANY(${statusList}))
				OR (
					cp.internal_entity_id IS NOT NULL
					AND ${licenseParentIsLive({ alias: sql`cp` })}
				)
			)
		ORDER BY
			EXISTS (SELECT 1 FROM customer_prices cpr WHERE cpr.customer_product_id = cp.id) DESC,
			prod.is_add_on ASC,
			cp.created_at DESC
		LIMIT ${SUBJECT_ROW_LIMITS.customerProducts}
	),

	subject_customer_prices AS (
		SELECT cpr.*
		FROM customer_prices cpr
		WHERE cpr.customer_product_id IN (SELECT id FROM subject_customer_products)
	),

	-- A contributing source stays: it holds no balance, and a plan zeroes or releases it in place.
	cp_customer_entitlements AS (
		SELECT ce.*
		FROM customer_entitlements ce
		JOIN subject_customer_products cp ON cp.id = ce.customer_product_id
		WHERE ce.pooled_balance_id IS NULL
	),

	-- Same liveness rule as looseEntitlementIsLiveSql: a spendable balance, unlimited,
	-- a boolean flag, or a pending reset. Drained one-off grants drop out.
	loose_customer_entitlements AS (
		SELECT ce.*
		FROM customer_entitlements ce
		WHERE ce.internal_customer_id IN (SELECT internal_id FROM customer_record)
			AND ce.customer_product_id IS NULL
			AND ${ownedBySubject({ alias: sql`ce` })}
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
		ORDER BY ce.id DESC
		LIMIT ${SUBJECT_ROW_LIMITS.looseCustomerEntitlements}
	),

	-- The pool behind pooled plan items: one customer-level row every entity draws from. Its sources
	-- (pooled_contribution_id set) hold no balance and stay out. A license pool is live while its parent is.
	pooled_customer_entitlements AS (
		SELECT ce.*
		FROM customer_entitlements ce
		JOIN pooled_balances pb ON pb.id = ce.pooled_balance_id
		WHERE ${customerOwnedOnly}
			AND ce.internal_customer_id IN (SELECT internal_id FROM customer_record)
			AND ce.customer_product_id IS NULL
			AND ce.internal_entity_id IS NULL
			AND ce.pooled_balance_id IS NOT NULL
			AND ce.pooled_contribution_id IS NULL
			AND (
				pb.customer_license_link_id IS NULL
				OR ${licenseParentIsLive({ alias: sql`pb` })}
			)
			AND (ce.expires_at IS NULL OR ce.expires_at > ${asOfTimestampMs})
		ORDER BY ce.id DESC
		LIMIT ${SUBJECT_ROW_LIMITS.pooledCustomerEntitlements}
	),

	subject_pooled_balances AS (
		SELECT pb.*
		FROM pooled_balances pb
		WHERE pb.id IN (SELECT pooled_balance_id FROM pooled_customer_entitlements)
	),

	all_customer_entitlements AS (
		SELECT * FROM cp_customer_entitlements
		UNION ALL
		SELECT * FROM loose_customer_entitlements
		UNION ALL
		SELECT * FROM pooled_customer_entitlements
	),

	subject_rollovers AS (
		SELECT ro.*
		FROM rollovers ro
		WHERE ro.cus_ent_id IN (SELECT id FROM all_customer_entitlements)
			AND (ro.expires_at IS NULL OR ro.expires_at > ${asOfTimestampMs})
	),

	subject_replaceables AS (
		SELECT rep.*
		FROM replaceables rep
		WHERE rep.cus_ent_id IN (SELECT id FROM all_customer_entitlements)
	),

	subject_usage_windows AS (
		SELECT uw.*
		FROM usage_windows uw
		WHERE uw.internal_customer_id IN (SELECT internal_id FROM customer_record)
			AND ${ownedBySubject({ alias: sql`uw` })}
	),

	-- License pools hang off the customer's own products; an entity's seats own none.
	subject_customer_licenses AS (
		SELECT cl.*
		FROM customer_licenses cl
		WHERE cl.parent_customer_product_id IN (SELECT id FROM subject_customer_products)
	),

	subject_open_locks AS (
		SELECT bl.id, bl.lock_id
		FROM balance_locks bl
		WHERE bl.internal_customer_id IN (SELECT internal_id FROM customer_record)
			AND ${customerOwnedOnly}
	)

	SELECT json_build_object(
		'customer', (SELECT row_to_json(c) FROM customer_record c),
		'customer_products', COALESCE(
			(SELECT json_agg(row_to_json(cp) ORDER BY cp.created_at DESC, cp.id) FROM subject_customer_products cp),
			'[]'::json
		),
		'customer_prices', COALESCE(
			(SELECT json_agg(row_to_json(cpr) ORDER BY cpr.id) FROM subject_customer_prices cpr),
			'[]'::json
		),
		'customer_entitlements', COALESCE(
			(SELECT json_agg(row_to_json(ce) ORDER BY ce.id) FROM all_customer_entitlements ce),
			'[]'::json
		),
		'rollovers', COALESCE(
			(SELECT json_agg(row_to_json(ro) ORDER BY ro.expires_at ASC NULLS LAST, ro.id) FROM subject_rollovers ro),
			'[]'::json
		),
		'replaceables', COALESCE(
			(SELECT json_agg(row_to_json(rep) ORDER BY rep.created_at ASC, rep.id) FROM subject_replaceables rep),
			'[]'::json
		),
		'usage_windows', COALESCE(
			(SELECT json_agg(row_to_json(uw) ORDER BY uw.id) FROM subject_usage_windows uw),
			'[]'::json
		),
		'pooled_balances', COALESCE(
			(SELECT json_agg(row_to_json(pb) ORDER BY pb.id) FROM subject_pooled_balances pb),
			'[]'::json
		),
		'customer_licenses', COALESCE(
			(SELECT json_agg(row_to_json(cl) ORDER BY cl.id) FROM subject_customer_licenses cl),
			'[]'::json
		),
		'open_locks', COALESCE(
			(SELECT json_agg(row_to_json(bl) ORDER BY bl.id) FROM subject_open_locks bl),
			'[]'::json
		),
		'entity', (SELECT row_to_json(e) FROM entity_record e)
	) AS envelope
`;
};
