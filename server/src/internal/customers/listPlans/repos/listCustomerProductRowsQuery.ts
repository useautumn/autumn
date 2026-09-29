import type {
	CusProductStatus,
	CustomerWalkCursorFields,
} from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import { planetScaleTag } from "@/db/dbUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { notLicenseAssignmentSql } from "@/internal/licenses/repos/licenseAssignmentRepo.js";
import {
	customerWalkOrderSql,
	customerWalkRowAfterSql,
	customerWalkStartSql,
} from "../../customerWalk/customerWalkSql.js";
import type { ListScope } from "../../customerWalk/types/listScope.js";
import {
	customerEntitlementsLateral,
	customerPricesLateral,
	freeTrialLateral,
	oneOffPredicate,
} from "../../getCustomerProductsPageQuery.js";

export type CustomerProductListKind = "subscription" | "purchase";

const walkColumns = {
	customerColumn: sql`cp.internal_customer_id`,
	createdAtColumn: sql`cp.created_at`,
	idColumn: sql`cp.id`,
};

const rowFiltersSql = ({
	ctx,
	kind,
	dbStatuses,
	planId,
	internalEntityId,
	cursor,
}: {
	ctx: AutumnContext;
	kind: CustomerProductListKind;
	dbStatuses: CusProductStatus[];
	planId?: string;
	internalEntityId: string | null;
	cursor: CustomerWalkCursorFields | null;
}): SQL => sql`
	AND cp.status = ANY(ARRAY[${sql.join(
		dbStatuses.map((status) => sql`${status}`),
		sql`, `,
	)}])
	AND ${kind === "purchase" ? oneOffPredicate : sql`NOT ${oneOffPredicate}`}
	AND ${sql.raw(notLicenseAssignmentSql("cp"))}
	${planId ? sql`AND prod.id = ${planId} AND prod.org_id = ${ctx.org.id} AND prod.env = ${ctx.env}` : sql``}
	${internalEntityId ? sql`AND cp.internal_entity_id = ${internalEntityId}` : sql``}
	${customerWalkRowAfterSql({ ...walkColumns, cursor })}
`;

/** Picks the cheapest walk: one customer, one plan's rows, or customer by customer up to the boundary. */
const selectPageSql = ({
	ctx,
	scope,
	planId,
	filters,
	cursor,
	boundaryCustomerId,
	limit,
}: {
	ctx: AutumnContext;
	scope: ListScope;
	planId?: string;
	filters: SQL;
	cursor: CustomerWalkCursorFields | null;
	boundaryCustomerId: string | null;
	limit: number;
}): SQL => {
	const order = customerWalkOrderSql(walkColumns);

	if (scope.internalCustomerId) {
		return sql`
			SELECT cp.*
			FROM customer_products cp
			JOIN products prod ON cp.internal_product_id = prod.internal_id
			WHERE cp.internal_customer_id = ${scope.internalCustomerId}
			${filters}
			${order}
			LIMIT ${limit + 1}`;
	}

	if (planId) {
		return sql`
			SELECT cp.*
			FROM customer_products cp
			JOIN products prod ON cp.internal_product_id = prod.internal_id
			WHERE cp.internal_product_id IN (
				SELECT internal_id FROM products
				WHERE org_id = ${ctx.org.id} AND env = ${ctx.env} AND id = ${planId}
			)
			${filters}
			${order}
			LIMIT ${limit + 1}`;
	}

	return sql`
		SELECT cp.*
		FROM customers c
		CROSS JOIN LATERAL (
			SELECT cp.*
			FROM customer_products cp
			JOIN products prod ON cp.internal_product_id = prod.internal_id
			WHERE cp.internal_customer_id = c.internal_id
			${filters}
			ORDER BY cp.created_at DESC, cp.id DESC
		) cp
		WHERE c.org_id = ${ctx.org.id} AND c.env = ${ctx.env}
		${customerWalkStartSql({ column: sql`c.internal_id`, cursor })}
		${boundaryCustomerId ? sql`AND c.internal_id >= ${boundaryCustomerId}` : sql``}
		ORDER BY c.internal_id DESC, cp.created_at DESC, cp.id DESC
		LIMIT ${limit + 1}`;
};

/**
 * One page of customer_products in (customer DESC, created_at DESC, id DESC) order.
 * Scoped to a customer, walked by plan, or walked customer by customer up to a boundary.
 */
export const listCustomerProductRowsQuery = ({
	ctx,
	scope,
	kind,
	dbStatuses,
	planId,
	cursor,
	boundaryCustomerId,
	limit,
}: {
	ctx: AutumnContext;
	scope: ListScope;
	kind: CustomerProductListKind;
	dbStatuses: CusProductStatus[];
	planId?: string;
	cursor: CustomerWalkCursorFields | null;
	boundaryCustomerId: string | null;
	limit: number;
}): SQL => {
	const filters = rowFiltersSql({
		ctx,
		kind,
		dbStatuses,
		planId,
		internalEntityId: scope.internalEntityId,
		cursor,
	});
	const order = customerWalkOrderSql(walkColumns);

	const pageSql = selectPageSql({
		ctx,
		scope,
		planId,
		filters,
		cursor,
		boundaryCustomerId,
		limit,
	});

	return sql`
		WITH page AS MATERIALIZED (${pageSql})
		SELECT
			cp.*,
			cus.id AS customer_public_id,
			row_to_json(prod) AS product,
			cpr_data.customer_prices,
			ce_data.customer_entitlements,
			ft_data.free_trial
		FROM page cp
		JOIN products prod ON cp.internal_product_id = prod.internal_id
		JOIN customers cus ON cus.internal_id = cp.internal_customer_id
		${customerPricesLateral}
		${customerEntitlementsLateral}
		${freeTrialLateral}
		${order}
		${planetScaleTag({ query: "listCustomerProductRows" })}`;
};
