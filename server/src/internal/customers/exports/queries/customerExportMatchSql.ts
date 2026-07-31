import { customerProducts, customers, products } from "@autumn/shared";
import { type SQL, sql } from "drizzle-orm";
import type { CustomerSearchPredicates } from "../../CusSearchService.js";

/**
 * The FROM/WHERE shape that decides export membership. Mirrors the dashboard
 * list query exactly so an export always contains what the table showed.
 */
export const buildMatchedCustomersSelect = ({
	predicates,
	columns,
	extraWhere,
}: {
	predicates: CustomerSearchPredicates;
	columns: SQL;
	extraWhere?: SQL;
}): SQL => {
	const where = extraWhere
		? sql`${predicates.whereRaw} AND ${extraWhere}`
		: predicates.whereRaw;

	if (predicates.kind === "productMode") {
		const productJoin = predicates.useInnerJoin
			? sql`INNER JOIN ${products} ON ${customerProducts.internal_product_id} = ${products.internal_id}`
			: sql`LEFT JOIN ${products} ON ${customerProducts.internal_product_id} = ${products.internal_id}`;

		return sql`
			SELECT DISTINCT ${columns}
			FROM ${customerProducts}
			${productJoin}
			LEFT JOIN ${customers} ON ${customerProducts.internal_customer_id} = ${customers.internal_id}
			WHERE ${where}
		`;
	}

	return sql`
		SELECT ${columns}
		FROM ${customers}
		WHERE ${where}
	`;
};

/** Descending [upper, lower) window over `customers.internal_id`. */
export const buildInternalIdRangeClause = ({
	upperInternalId,
	lowerInternalId,
}: {
	upperInternalId: string | null;
	lowerInternalId: string | null;
}): SQL | undefined => {
	const clauses: SQL[] = [];

	if (upperInternalId !== null) {
		clauses.push(sql`${customers.internal_id} <= ${upperInternalId}`);
	}
	if (lowerInternalId !== null) {
		clauses.push(sql`${customers.internal_id} > ${lowerInternalId}`);
	}

	if (clauses.length === 0) return undefined;
	return sql`(${sql.join(clauses, sql` AND `)})`;
};
