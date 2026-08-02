import { BillingInterval, MIGRATABLE_STATUSES } from "@autumn/shared";
import type { PlanFilter } from "@autumn/shared/api/migrations/filters/planFilter.js";
import { type SQL, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { sqlList } from "@/internal/billing/v2/actions/batchTransition/execute/sql/batchTransitionSqlUtils.js";
import {
	lowerBooleanMatcher,
	lowerNullExistenceMatcher,
	type ScalarConstraint,
} from "./utils/scalarConstraint.js";

/**
 * The row-level scope one patch executes against — compute's lowered residue
 * of the plan filter. Catalog-decidable predicates (plan_id, version, addon)
 * are already erased into `internalProductId`; only row-varying constraints
 * survive, `null` meaning unconstrained.
 */
export const OperationScopeSchema = z.object({
	internalProductId: z.string(),
	/** customer_products.is_custom. */
	isCustom: z.boolean().nullable(),
	/** Has ≥1 customer_price (base or item). */
	isPaid: z.boolean().nullable(),
	/** Has ≥1 customer_price whose price interval isn't one_off. */
	isRecurring: z.boolean().nullable(),
	/** Has a BASE customer_price (price with entitlement_id IS NULL). */
	hasBasePrice: z.boolean().nullable(),
});

export type OperationScope = z.infer<typeof OperationScopeSchema>;

export type OperationScopeConstraintKey = Exclude<
	keyof OperationScope,
	"internalProductId"
>;

const negatable = (fragment: SQL, constraint: boolean): SQL =>
	constraint ? fragment : sql`NOT ${fragment}`;

/** EXISTS semantics mirror the filter compiler's customerRegistry — the two
 * MUST stay in lockstep so batch-lane scoping equals customer-select
 * semantics. */
const paidExists = sql`EXISTS (
	SELECT 1 FROM customer_prices AS customer_price
	WHERE customer_price.customer_product_id = cp.id
)`;

const recurringExists = sql`EXISTS (
	SELECT 1 FROM customer_prices AS customer_price
	INNER JOIN prices AS price ON price.id = customer_price.price_id
	WHERE customer_price.customer_product_id = cp.id
		AND price.config->>'interval' <> ${BillingInterval.OneOff}
)`;

const basePriceExists = sql`EXISTS (
	SELECT 1 FROM customer_prices AS customer_price
	INNER JOIN prices AS price ON price.id = customer_price.price_id
	WHERE customer_price.customer_product_id = cp.id
		AND price.entitlement_id IS NULL
)`;

export type OperationScopeField = {
	/** PlanFilter key this constraint lowers from. */
	filterKey: "custom" | "paid" | "recurring" | "price";
	scopeKey: OperationScopeConstraintKey;
	lower: (raw: unknown) => ScalarConstraint;
	toSql: (constraint: boolean) => SQL;
};

/**
 * Every row-decidable plan-filter field, in one table: resolution
 * (resolveOperationScope) and rendering (operationScopeSql) are both driven
 * by it. `item` stays unsupported (structural); plan_id/version/addon are
 * catalog-decidable and never reach the scope.
 */
export const OPERATION_SCOPE_FIELDS: OperationScopeField[] = [
	{
		filterKey: "custom",
		scopeKey: "isCustom",
		lower: lowerBooleanMatcher,
		toSql: (constraint) => sql`cp.is_custom = ${constraint}`,
	},
	{
		filterKey: "paid",
		scopeKey: "isPaid",
		lower: lowerBooleanMatcher,
		toSql: (constraint) => negatable(paidExists, constraint),
	},
	{
		filterKey: "recurring",
		scopeKey: "isRecurring",
		lower: lowerBooleanMatcher,
		toSql: (constraint) => negatable(recurringExists, constraint),
	},
	{
		filterKey: "price",
		scopeKey: "hasBasePrice",
		lower: lowerNullExistenceMatcher,
		toSql: (constraint) => negatable(basePriceExists, constraint),
	},
];

/** An unconstrained scope for `internalProductId`, with per-field overrides. */
export const buildOperationScope = ({
	internalProductId,
	...overrides
}: Partial<OperationScope> & {
	internalProductId: string;
}): OperationScope => ({
	isCustom: null,
	isPaid: null,
	isRecurring: null,
	hasBasePrice: null,
	internalProductId,
	...overrides,
});

/**
 * The plan filter with row-decidable fields stripped — safe for catalog
 * matching (planFilterMatchesProduct throws on `price` and cannot see rows);
 * the scope SQL enforces the stripped fields per row instead.
 */
export const toCatalogPlanFilter = (filter: PlanFilter): PlanFilter => {
	const catalogFilter = { ...filter };
	for (const field of OPERATION_SCOPE_FIELDS) {
		delete catalogFilter[field.filterKey];
	}
	if (catalogFilter.$or) {
		catalogFilter.$or = catalogFilter.$or.map(toCatalogPlanFilter);
	}
	return catalogFilter;
};

/**
 * The single renderer of an operation scope over `customer_products AS cp`.
 * Callers AND this with their own customer-id predicate; license assignments
 * stay excluded — seats belong to the license machinery.
 */
export const operationScopeSql = ({
	scope,
}: {
	scope: OperationScope;
}): SQL => {
	const constraintConditions = OPERATION_SCOPE_FIELDS.map((field) => {
		const constraint = scope[field.scopeKey];
		return constraint === null ? sql`` : sql`AND ${field.toSql(constraint)}`;
	});

	return sql`(
		cp.internal_product_id = ${scope.internalProductId}
		AND cp.status IN (${sqlList({ values: [...MIGRATABLE_STATUSES] })})
		AND cp.customer_license_link_id IS NULL
		${sql.join(constraintConditions, sql` `)}
	)`;
};
