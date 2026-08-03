import type { IRLeaf, IRNav, IRNode } from "../../compiler/ir/irTypes.js";
import type {
	PlanIdConstraint,
	PlanSourceExtra,
} from "./accessPaths/planPlanIdAccessPath.js";

export type ChosenCustomerAccessPath = {
	id: "plan.plan_id";
	constraint: PlanIdConstraint;
	/** Set when the source proves the ENTIRE plan quantifier, so the caller
	 * may drop this nav from the fallback WHERE. */
	consumedNav?: IRNav;
};

/**
 * Consumption is all-or-nothing per quantifier: every predicate shares one
 * `$some` (one cp row must satisfy all of them), so dropping only some from
 * the WHERE would let different cp rows satisfy different predicates.
 */
export const chooseCustomerAccessPath = (
	ir: IRNode,
): ChosenCustomerAccessPath | undefined => {
	const planNav = findNecessaryPlanNav(ir);
	if (!planNav) return undefined;

	const nodes = childrenOf(planNav.child);
	const planIdNode = nodes.find(isPlanIdLeaf);
	const constraint = planIdNode && toPlanIdConstraint(planIdNode);
	if (!constraint) return undefined;

	const extras: PlanSourceExtra[] = [];
	for (const node of nodes) {
		if (node === planIdNode) continue;
		const extra = node.kind === "leaf" ? toSourceExtra(node) : undefined;
		if (!extra) return { id: "plan.plan_id", constraint };
		extras.push(extra);
	}
	return {
		id: "plan.plan_id",
		constraint: { ...constraint, extras },
		consumedNav: planNav,
	};
};

const childrenOf = (node: IRNode): readonly IRNode[] =>
	node.kind === "and" ? node.children : [node];

const findNecessaryPlanNav = (node: IRNode): IRNav | undefined =>
	childrenOf(node).find(
		(child): child is IRNav =>
			child.kind === "nav" &&
			child.name === "plan" &&
			child.quantifier === "some",
	);

const isPlanIdLeaf = (node: IRNode): node is IRLeaf =>
	node.kind === "leaf" &&
	node.field === "plan_id" &&
	(node.op === "eq" || node.op === "in");

const toPlanIdConstraint = (leaf: IRLeaf): PlanIdConstraint | undefined => {
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

const toSourceExtra = (leaf: IRLeaf): PlanSourceExtra | undefined => {
	if (leaf.field === "version") {
		if (leaf.op === "eq" && typeof leaf.value === "number") {
			return { field: "version", op: "eq", value: leaf.value };
		}
		if (
			leaf.op === "in" &&
			Array.isArray(leaf.value) &&
			leaf.value.length > 0 &&
			leaf.value.every((value) => typeof value === "number")
		) {
			return { field: "version", op: "in", value: leaf.value };
		}
		return undefined;
	}
	if (
		(leaf.field === "addon" ||
			leaf.field === "custom" ||
			leaf.field === "paid" ||
			leaf.field === "recurring") &&
		leaf.op === "eq" &&
		typeof leaf.value === "boolean"
	) {
		return { field: leaf.field, op: "eq", value: leaf.value };
	}
	if (
		leaf.field === "price" &&
		leaf.op === "exists" &&
		typeof leaf.value === "boolean"
	) {
		return { field: "price", op: "exists", value: leaf.value };
	}
	return undefined;
};
