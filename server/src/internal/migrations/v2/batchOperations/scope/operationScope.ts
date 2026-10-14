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

export const OperationScopeSchema = z.object({
	internalProductId: z.string(),
	isCustom: z.boolean().nullable(),
	isPaid: z.boolean().nullable(),
	isRecurring: z.boolean().nullable(),
	hasBasePrice: z.boolean().nullable(),
});

export type OperationScope = z.infer<typeof OperationScopeSchema>;

export type OperationScopeConstraintKey = Exclude<
	keyof OperationScope,
	"internalProductId"
>;

const negatable = (fragment: SQL, constraint: boolean): SQL =>
	constraint ? fragment : sql`NOT ${fragment}`;

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
	filterKey: "custom" | "paid" | "recurring" | "price";
	scopeKey: OperationScopeConstraintKey;
	lower: (raw: unknown) => ScalarConstraint;
	toSql: (constraint: boolean) => SQL;
};

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
