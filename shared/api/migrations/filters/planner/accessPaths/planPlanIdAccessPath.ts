import { RELEVANT_STATUSES } from "../../../../../utils/cusProductUtils/cusProductConstants.js";
import type { IRLeaf } from "../../../compiler/ir/irTypes.js";
import type { CustomerAccessPath } from "../types.js";

export type PlanIdConstraint = Pick<IRLeaf, "op" | "value"> & {
	field: "plan_id";
	op: "eq" | "in";
};

export const planPlanIdAccessPath: CustomerAccessPath<PlanIdConstraint> = {
	id: "plan.plan_id",
	buildSource: ({ constraint, ambient }) => {
		const params: unknown[] = [];
		const orgId = ambient.orgId;
		const env = ambient.env;
		if (orgId === undefined) throw new Error("Missing ambient orgId");
		if (env === undefined) throw new Error("Missing ambient env");

		params.push(orgId, env);
		const planPredicate =
			constraint.op === "eq"
				? buildEqPredicate(constraint.value, params)
				: buildInPredicate(constraint.value, params);
		params.push(...RELEVANT_STATUSES, orgId, env);
		const statusPlaceholders = RELEVANT_STATUSES.map(() => "?").join(", ");

		return {
			sql: [
				"(WITH plan_products AS MATERIALIZED (",
				"SELECT p.internal_id FROM products p",
				"WHERE p.org_id = ? AND p.env = ?",
				`AND ${planPredicate}`,
				") SELECT DISTINCT c.internal_id, c.id, c.name, c.email, c.org_id, c.env",
				"FROM plan_products pp",
				"JOIN customer_products cp ON cp.internal_product_id = pp.internal_id",
				"JOIN customers c ON c.internal_id = cp.internal_customer_id",
				`WHERE cp.status IN (${statusPlaceholders})`,
				"AND c.org_id = ?",
				"AND c.env = ?) c",
			].join(" "),
			params,
		};
	},
};

const buildEqPredicate = (value: PlanIdConstraint["value"], params: unknown[]) => {
	if (typeof value !== "string")
		throw new Error("plan.plan_id eq access path requires a string value");
	params.push(value);
	return "p.id = ?";
};

const buildInPredicate = (value: PlanIdConstraint["value"], params: unknown[]) => {
	if (!Array.isArray(value) || value.some((v) => typeof v !== "string"))
		throw new Error("plan.plan_id in access path requires string values");
	if (value.length === 0) return "FALSE";
	params.push(...value);
	return `p.id IN (${value.map(() => "?").join(", ")})`;
};
