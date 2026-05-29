import type { IRLeaf, IRNav, IRNode } from "../../compiler/ir/irTypes.js";
import type { PlanIdConstraint } from "./accessPaths/planPlanIdAccessPath.js";

export type ChosenCustomerAccessPath = {
	id: "plan.plan_id";
	constraint: PlanIdConstraint;
};

export const chooseCustomerAccessPath = (
	ir: IRNode,
): ChosenCustomerAccessPath | undefined => {
	const planNav = findNecessaryPlanNav(ir);
	if (!planNav) return undefined;

	const planIdLeaf = findNecessaryPlanIdLeaf(planNav.child);
	if (!planIdLeaf) return undefined;

	return {
		id: "plan.plan_id",
		constraint: {
			field: "plan_id",
			op: planIdLeaf.op,
			value: planIdLeaf.value,
		},
	};
};

const findNecessaryPlanNav = (node: IRNode): IRNav | undefined => {
	const children = node.kind === "and" ? node.children : [node];
	return children.find(
		(child): child is IRNav =>
			child.kind === "nav" &&
			child.name === "plan" &&
			child.quantifier === "some",
	);
};

const findNecessaryPlanIdLeaf = (node: IRNode): PlanIdConstraint | undefined => {
	const children = node.kind === "and" ? node.children : [node];
	const leaf = children.find(
		(child): child is IRLeaf =>
			child.kind === "leaf" &&
			child.field === "plan_id" &&
			(child.op === "eq" || child.op === "in"),
	);

	if (!leaf) return undefined;
	if (leaf.op === "eq" && typeof leaf.value === "string") {
		return { field: "plan_id", op: "eq", value: leaf.value };
	}
	if (
		leaf.op === "in" &&
		Array.isArray(leaf.value) &&
		leaf.value.length > 0 &&
		leaf.value.every((value) => typeof value === "string")
	) {
		return { field: "plan_id", op: "in", value: leaf.value };
	}
	return undefined;
};
