import {
	type CusProductStatus,
	CustomerProductKind,
	type CustomerProductsCursorFields,
} from "@autumn/shared";
import { sql } from "drizzle-orm";

export type CustomerProductsPageQueryArgs = {
	internalCustomerId: string;
	inStatuses?: CusProductStatus[];
	showExpired: boolean;
	entityId?: string;
	kind?: CustomerProductKind;
	limit: number;
	cursor?: CustomerProductsCursorFields;
};

export const cpStatusInClause = (inStatuses?: CusProductStatus[]) =>
	inStatuses?.length
		? sql`AND cp.status = ANY(ARRAY[${sql.join(
				inStatuses.map((status) => sql`${status}`),
				sql`, `,
			)}])`
		: sql``;

const oneOffPredicate = sql`(
	EXISTS (
		SELECT 1 FROM prices pr_one
		WHERE pr_one.internal_product_id = prod.internal_id
	)
	AND NOT EXISTS (
		SELECT 1 FROM prices pr_rec
		WHERE pr_rec.internal_product_id = prod.internal_id
			AND COALESCE(pr_rec.config->>'interval', 'one_off') <> 'one_off'
	)
)`;

const typeRankSql = sql`(
	CASE
		WHEN prod.is_add_on THEN 2
		WHEN ${oneOffPredicate} THEN 1
		ELSE 0
	END
)`;

const KIND_RANK: Record<CustomerProductKind, number> = {
	[CustomerProductKind.Subscription]: 0,
	[CustomerProductKind.OneOff]: 1,
	[CustomerProductKind.AddOn]: 2,
};

const entityRankSql = sql`(
	CASE
		WHEN cp.entity_id IS NULL AND cp.internal_entity_id IS NULL THEN 0
		ELSE 1
	END
)`;

const customerProductsOrderBy = sql`ORDER BY ${entityRankSql} ASC, ${typeRankSql} ASC, cp.created_at DESC, cp.id ASC`;

// Per-product JSON aggregates, joined laterally so each customer_products row
// carries its fully-hydrated prices / entitlements / free trial.
const customerPricesLateral = sql`
	LEFT JOIN LATERAL (
		SELECT COALESCE(
			json_agg(
				to_jsonb(cpr.*) || jsonb_build_object('price', to_jsonb(p.*))
			) FILTER (WHERE cpr.id IS NOT NULL),
			'[]'::json
		) AS customer_prices
		FROM customer_prices cpr
		LEFT JOIN prices p ON cpr.price_id = p.id
		WHERE cpr.customer_product_id = cp.id
	) cpr_data ON true`;

const customerEntitlementsLateral = sql`
	LEFT JOIN LATERAL (
		SELECT COALESCE(
			json_agg(
				to_jsonb(ce.*) || jsonb_build_object(
					'entitlement', (
						SELECT row_to_json(ent_with_feature)
						FROM (
							SELECT e.*, row_to_json(f) AS feature
							FROM entitlements e
							JOIN features f ON e.internal_feature_id = f.internal_id
							WHERE e.id = ce.entitlement_id
						) AS ent_with_feature
					),
					'replaceables', (
						SELECT COALESCE(
							json_agg(row_to_json(r)) FILTER (WHERE r.id IS NOT NULL),
							'[]'::json
						)
						FROM replaceables r
						WHERE r.cus_ent_id = ce.id
					),
					'rollovers', (
						SELECT COALESCE(
							json_agg(row_to_json(ro) ORDER BY ro.expires_at ASC NULLS LAST) FILTER (WHERE ro.expires_at > EXTRACT(EPOCH FROM now()) * 1000 OR ro.expires_at IS NULL),
							'[]'::json
						)
						FROM rollovers ro
						WHERE ro.cus_ent_id = ce.id
					)
				)
			) FILTER (WHERE ce.id IS NOT NULL),
			'[]'::json
		) AS customer_entitlements
		FROM customer_entitlements ce
		WHERE ce.customer_product_id = cp.id
	) ce_data ON true`;

const freeTrialLateral = sql`
	LEFT JOIN LATERAL (
		SELECT row_to_json(ft) AS free_trial
		FROM free_trials ft
		WHERE ft.id = cp.free_trial_id
	) ft_data ON true`;

const buildFilters = ({
	inStatuses,
	showExpired,
	entityId,
	kind,
}: {
	inStatuses?: CusProductStatus[];
	showExpired: boolean;
	entityId?: string;
	kind?: CustomerProductKind;
}) => {
	const statusFilter = showExpired ? sql`` : cpStatusInClause(inStatuses);

	const entityFilter = entityId
		? sql`AND (cp.entity_id = ${entityId} OR cp.internal_entity_id = ${entityId} OR (cp.entity_id IS NULL AND cp.internal_entity_id IS NULL))`
		: sql``;

	const kindFilter =
		kind === undefined ? sql`` : sql`AND ${typeRankSql} = ${KIND_RANK[kind]}`;

	return sql`${statusFilter} ${entityFilter} ${kindFilter}`;
};

export const getCustomerProductsPageQuery = ({
	internalCustomerId,
	inStatuses,
	showExpired,
	entityId,
	kind,
	limit,
	cursor,
}: CustomerProductsPageQueryArgs) => {
	const filters = buildFilters({ inStatuses, showExpired, entityId, kind });

	const cursorPredicate = cursor
		? sql`AND (
			${entityRankSql} > ${cursor.eRank}
			OR (${entityRankSql} = ${cursor.eRank} AND ${typeRankSql} > ${cursor.rank})
			OR (${entityRankSql} = ${cursor.eRank} AND ${typeRankSql} = ${cursor.rank} AND cp.created_at < ${cursor.t})
			OR (${entityRankSql} = ${cursor.eRank} AND ${typeRankSql} = ${cursor.rank} AND cp.created_at = ${cursor.t} AND cp.id > ${cursor.id})
		)`
		: sql``;

	const fetchLimit = limit + 1;

	return sql`
		SELECT
			cp.*,
			${typeRankSql} AS type_rank,
			${entityRankSql} AS entity_rank,
			row_to_json(prod) AS product,
			cpr_data.customer_prices,
			ce_data.customer_entitlements,
			ft_data.free_trial
		FROM customer_products cp
		JOIN products prod ON cp.internal_product_id = prod.internal_id
		${customerPricesLateral}
		${customerEntitlementsLateral}
		${freeTrialLateral}
		WHERE cp.internal_customer_id = ${internalCustomerId}
		${filters}
		${cursorPredicate}
		${customerProductsOrderBy}
		LIMIT ${fetchLimit}
	`;
};

export const getCustomerProductsCountQuery = ({
	internalCustomerId,
	inStatuses,
	showExpired,
	entityId,
	kind,
}: Omit<CustomerProductsPageQueryArgs, "limit" | "cursor">) => {
	const filters = buildFilters({ inStatuses, showExpired, entityId, kind });

	return sql`
		SELECT COUNT(*)::int AS total_count
		FROM customer_products cp
		JOIN products prod ON cp.internal_product_id = prod.internal_id
		WHERE cp.internal_customer_id = ${internalCustomerId}
		${filters}
	`;
};
