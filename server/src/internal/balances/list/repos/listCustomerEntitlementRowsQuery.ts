import {
	ACTIVE_STATUSES,
	type BalanceListStatus,
	CusProductStatus,
	type CustomerWalkCursorFields,
} from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import { planetScaleTag } from "@/db/dbUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	customerWalkOrderSql,
	customerWalkRowAfterSql,
	customerWalkStartSql,
} from "@/internal/customers/customerWalk/customerWalkSql.js";
import type { ListScope } from "@/internal/customers/customerWalk/types/listScope.js";
import { customerPricesLateral } from "@/internal/customers/getCustomerProductsPageQuery.js";
import { notLicenseAssignmentSql } from "@/internal/licenses/repos/licenseAssignmentRepo.js";

const walkColumns = {
	customerColumn: sql`ce.internal_customer_id`,
	createdAtColumn: sql`ce.created_at`,
	idColumn: sql`ce.id`,
};

/** Plan-backed rows follow their customer_product's status; loose grants follow expires_at. */
const expiredSql = ({ now }: { now: number }) => sql`(
	(cp.id IS NOT NULL AND cp.status = ${CusProductStatus.Expired})
	OR (ce.customer_product_id IS NULL AND ce.expires_at IS NOT NULL AND ce.expires_at <= ${now})
)`;

const activeSql = ({ now }: { now: number }) => sql`(
	(cp.id IS NOT NULL AND cp.status = ANY(ARRAY[${sql.join(
		ACTIVE_STATUSES.map((status) => sql`${status}`),
		sql`, `,
	)}]))
	OR (ce.customer_product_id IS NULL AND (ce.expires_at IS NULL OR ce.expires_at > ${now}))
)`;

const statusSql = ({
	statuses,
	now,
}: {
	statuses: BalanceListStatus[];
	now: number;
}) =>
	sql`(${sql.join(
		statuses.map((status) =>
			status === "expired" ? expiredSql({ now }) : activeSql({ now }),
		),
		sql` OR `,
	)})`;

const planSql = ({
	ctx,
	planId,
}: {
	ctx: AutumnContext;
	planId?: string | null;
}) => {
	if (planId === undefined) return sql``;
	if (planId === null) return sql`AND ce.customer_product_id IS NULL`;
	return sql`AND cp.internal_product_id IN (
		SELECT internal_id FROM products
		WHERE org_id = ${ctx.org.id} AND env = ${ctx.env} AND id = ${planId}
	)`;
};

const rowFiltersSql = ({
	ctx,
	statuses,
	planId,
	featureId,
	internalEntityId,
	cursor,
	now,
}: {
	ctx: AutumnContext;
	statuses: BalanceListStatus[];
	planId?: string | null;
	featureId?: string;
	internalEntityId: string | null;
	cursor: CustomerWalkCursorFields | null;
	now: number;
}): SQL => sql`
	AND ${statusSql({ statuses, now })}
	AND (cp.id IS NULL OR ${sql.raw(notLicenseAssignmentSql("cp"))})
	${planSql({ ctx, planId })}
	${
		featureId
			? sql`AND ce.internal_feature_id IN (
				SELECT internal_id FROM features
				WHERE org_id = ${ctx.org.id} AND env = ${ctx.env} AND id = ${featureId}
			)`
			: sql``
	}
	${internalEntityId ? sql`AND COALESCE(cp.internal_entity_id, ce.internal_entity_id) = ${internalEntityId}` : sql``}
	${customerWalkRowAfterSql({ ...walkColumns, cursor })}
`;

const selectPageSql = ({
	ctx,
	scope,
	filters,
	cursor,
	boundaryCustomerId,
	limit,
}: {
	ctx: AutumnContext;
	scope: ListScope;
	filters: SQL;
	cursor: CustomerWalkCursorFields | null;
	boundaryCustomerId: string | null;
	limit: number;
}): SQL => {
	if (scope.internalCustomerId) {
		return sql`
			SELECT ce.id, ce.internal_customer_id, ce.created_at
			FROM customer_entitlements ce
			LEFT JOIN customer_products cp ON cp.id = ce.customer_product_id
			WHERE ce.internal_customer_id = ${scope.internalCustomerId}
			${filters}
			${customerWalkOrderSql(walkColumns)}
			LIMIT ${limit + 1}`;
	}

	return sql`
		SELECT ce.id, ce.internal_customer_id, ce.created_at
		FROM customers c
		CROSS JOIN LATERAL (
			SELECT ce.id, ce.internal_customer_id, ce.created_at
			FROM customer_entitlements ce
			LEFT JOIN customer_products cp ON cp.id = ce.customer_product_id
			WHERE ce.internal_customer_id = c.internal_id
			${filters}
			ORDER BY ce.created_at DESC, ce.id DESC
		) ce
		WHERE c.org_id = ${ctx.org.id} AND c.env = ${ctx.env}
		${customerWalkStartSql({ column: sql`c.internal_id`, cursor })}
		${boundaryCustomerId ? sql`AND c.internal_id >= ${boundaryCustomerId}` : sql``}
		ORDER BY c.internal_id DESC, ce.created_at DESC, ce.id DESC
		LIMIT ${limit + 1}`;
};

/**
 * One page of customer_entitlements in (customer DESC, created_at DESC, id DESC) order,
 * each hydrated with its entitlement, rollovers and (when plan-backed) customer_product.
 */
export const listCustomerEntitlementRowsQuery = ({
	ctx,
	scope,
	statuses,
	planId,
	featureId,
	cursor,
	boundaryCustomerId,
	limit,
	now,
}: {
	ctx: AutumnContext;
	scope: ListScope;
	statuses: BalanceListStatus[];
	planId?: string | null;
	featureId?: string;
	cursor: CustomerWalkCursorFields | null;
	boundaryCustomerId: string | null;
	limit: number;
	now: number;
}): SQL => {
	const filters = rowFiltersSql({
		ctx,
		statuses,
		planId,
		featureId,
		internalEntityId: scope.internalEntityId,
		cursor,
		now,
	});
	const pageSql = selectPageSql({
		ctx,
		scope,
		filters,
		cursor,
		boundaryCustomerId,
		limit,
	});

	return sql`
		WITH page AS MATERIALIZED (${pageSql})
		SELECT
			ce.internal_customer_id,
			ce.created_at,
			ce.id,
			cus.id AS customer_public_id,
			ent.id AS entity_public_id,
			CASE WHEN ${expiredSql({ now })} THEN 'expired' ELSE 'active' END AS list_status,
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
					SELECT COALESCE(json_agg(row_to_json(r)), '[]'::json)
					FROM replaceables r
					WHERE r.cus_ent_id = ce.id
				),
				'rollovers', (
					SELECT COALESCE(
						json_agg(row_to_json(ro) ORDER BY ro.expires_at ASC NULLS LAST)
							FILTER (WHERE ro.expires_at > ${now} OR ro.expires_at IS NULL),
						'[]'::json
					)
					FROM rollovers ro
					WHERE ro.cus_ent_id = ce.id
				),
				'customer_product', CASE WHEN cp.id IS NULL THEN NULL ELSE
					to_jsonb(cp.*) || jsonb_build_object(
						'product', to_jsonb(prod.*),
						'customer_prices', cpr_data.customer_prices
					)
				END
			) AS customer_entitlement
		FROM page
		JOIN customer_entitlements ce ON ce.id = page.id
		LEFT JOIN customer_products cp ON cp.id = ce.customer_product_id
		LEFT JOIN products prod ON prod.internal_id = cp.internal_product_id
		JOIN customers cus ON cus.internal_id = ce.internal_customer_id
		LEFT JOIN entities ent ON ent.internal_id = COALESCE(cp.internal_entity_id, ce.internal_entity_id)
		${customerPricesLateral}
		${customerWalkOrderSql(walkColumns)}
		${planetScaleTag({ query: "listCustomerEntitlementRows" })}`;
};
