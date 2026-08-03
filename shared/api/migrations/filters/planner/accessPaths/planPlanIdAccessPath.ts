import { RELEVANT_STATUSES } from "../../../../../utils/cusProductUtils/cusProductConstants.js";
import type { IRLeaf } from "../../../compiler/ir/irTypes.js";
import type { CompiledSql } from "../../../compiler/irToSql/irToSql.js";
import {
	PLAN_BASE_PRICE_SQL,
	PLAN_PAID_EXISTS_SQL,
	PLAN_RECURRING_EXISTS_SQL,
} from "../../../compiler/registry/customerRegistry.js";
import type { CustomerAccessPath } from "../types.js";

/** Sibling plan-quantifier predicate the source can prove itself. */
export type PlanSourceExtra =
	| { field: "version"; op: "eq" | "in"; value: number | readonly number[] }
	| {
			field: "addon" | "custom" | "paid" | "recurring";
			op: "eq";
			value: boolean;
	  }
	| { field: "price"; op: "exists"; value: boolean };

export type PlanIdConstraint = Pick<IRLeaf, "op" | "value"> & {
	field: "plan_id";
	op: "eq" | "in";
	/** Present only when the source proves the ENTIRE plan quantifier. */
	extras?: PlanSourceExtra[];
};

/** Each extra renders in the products SELECT (`p`) or the cp WHERE (`cp`) —
 * derived-filter SQL is shared with the registry leaves for parity. */
const EXTRA_DEFS: Record<
	PlanSourceExtra["field"],
	{ context: "product" | "customerProduct"; sql: string }
> = {
	version: { context: "product", sql: "p.version" },
	addon: { context: "product", sql: "p.is_add_on" },
	custom: { context: "customerProduct", sql: "cp.is_custom" },
	paid: { context: "customerProduct", sql: PLAN_PAID_EXISTS_SQL },
	recurring: { context: "customerProduct", sql: PLAN_RECURRING_EXISTS_SQL },
	price: { context: "customerProduct", sql: PLAN_BASE_PRICE_SQL },
};

const renderExtra = (extra: PlanSourceExtra, params: unknown[]): string => {
	const expression = EXTRA_DEFS[extra.field].sql;
	if (extra.op === "exists") {
		return `AND ${expression} IS ${extra.value === true ? "NOT NULL" : "NULL"}`;
	}
	if (extra.op === "eq") {
		params.push(extra.value);
		return `AND ${expression} = ?`;
	}
	const values = extra.value as readonly number[];
	params.push(...values);
	return `AND ${expression} IN (${values.map(() => "?").join(", ")})`;
};

/** SELECT of matching plan product internal ids (org/env + plan predicate +
 * consumed product-level extras). */
export const buildPlanProductsSql = ({
	constraint,
	ambient,
}: {
	constraint: PlanIdConstraint;
	ambient: Record<string, unknown>;
}): CompiledSql => {
	const orgId = ambient.orgId;
	const env = ambient.env;
	if (orgId === undefined) throw new Error("Missing ambient orgId");
	if (env === undefined) throw new Error("Missing ambient env");

	const params: unknown[] = [orgId, env];
	const planPredicate =
		constraint.op === "eq"
			? buildEqPredicate(constraint.value, params)
			: buildInPredicate(constraint.value, params);
	const productExtras = (constraint.extras ?? []).filter(
		(extra) => EXTRA_DEFS[extra.field].context === "product",
	);
	const extraSql = productExtras.map((extra) => renderExtra(extra, params));

	return {
		sql: [
			"SELECT p.internal_id FROM products p",
			"WHERE p.org_id = ? AND p.env = ?",
			`AND ${planPredicate}`,
			...extraSql,
		].join(" "),
		params,
	};
};

/** cp-level predicates: relevant-status ambient + consumed cp extras. */
export const buildCustomerProductWhereSql = (
	constraint: PlanIdConstraint,
): CompiledSql => {
	const params: unknown[] = [...RELEVANT_STATUSES];
	const statusPlaceholders = RELEVANT_STATUSES.map(() => "?").join(", ");
	const customerProductExtras = (constraint.extras ?? []).filter(
		(extra) => EXTRA_DEFS[extra.field].context === "customerProduct",
	);
	const extraSql = customerProductExtras.map((extra) =>
		renderExtra(extra, params),
	);
	return {
		sql: [`cp.status IN (${statusPlaceholders})`, ...extraSql].join(" "),
		params,
	};
};

export const planPlanIdAccessPath: CustomerAccessPath<PlanIdConstraint> = {
	id: "plan.plan_id",
	buildSource: ({ constraint, ambient }) => {
		const planProducts = buildPlanProductsSql({ constraint, ambient });
		const customerProductWhere = buildCustomerProductWhereSql(constraint);
		return {
			sql: [
				"(WITH plan_products AS MATERIALIZED (",
				planProducts.sql,
				") SELECT DISTINCT c.internal_id, c.id, c.name, c.email, c.org_id, c.env",
				"FROM plan_products pp",
				"JOIN customer_products cp ON cp.internal_product_id = pp.internal_id",
				"JOIN customers c ON c.internal_id = cp.internal_customer_id",
				`WHERE ${customerProductWhere.sql}`,
				"AND c.org_id = ?",
				"AND c.env = ?) c",
			].join(" "),
			params: [
				...planProducts.params,
				...customerProductWhere.params,
				ambient.orgId,
				ambient.env,
			],
		};
	},
};

const buildEqPredicate = (
	value: PlanIdConstraint["value"],
	params: unknown[],
) => {
	if (typeof value !== "string")
		throw new Error("plan.plan_id eq access path requires a string value");
	params.push(value);
	return "p.id = ?";
};

const buildInPredicate = (
	value: PlanIdConstraint["value"],
	params: unknown[],
) => {
	if (!Array.isArray(value) || value.some((v) => typeof v !== "string"))
		throw new Error("plan.plan_id in access path requires string values");
	if (value.length === 0) return "FALSE";
	params.push(...value);
	return `p.id IN (${value.map(() => "?").join(", ")})`;
};
