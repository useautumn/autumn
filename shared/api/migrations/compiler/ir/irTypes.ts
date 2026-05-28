/**
 * Intermediate Representation (IR) for migration filters.
 *
 * The filter pipeline is:
 *   Filter (Zod, public DSL) → IR (canonical AST) → SQL (Drizzle fragment)
 *
 * The IR is the compiler-friendly middle layer. It collapses every spelling
 * of the public DSL (`feature_id: "x"` ≡ `{ $eq: "x" }`, `price: null` ≡
 * `{ $eq: null }`) into one canonical shape, so the compiler only handles
 * one form per concept.
 */

export type LeafOp =
	| "eq"
	| "ne"
	| "in"
	| "nin"
	| "exists"
	| "gt"
	| "gte"
	| "lt"
	| "lte";

export type LeafValue =
	| string
	| number
	| boolean
	| null
	| readonly string[]
	| readonly number[];

export type IRLeaf = {
	kind: "leaf";
	/** Field name in the current scope's registry, e.g. "plan_id". */
	field: string;
	op: LeafOp;
	value: LeafValue;
};

export type IRAnd = {
	kind: "and";
	children: readonly IRNode[];
};

export type IROr = {
	kind: "or";
	children: readonly IRNode[];
};

export type Quantifier = "some" | "none";

export type IRNav = {
	kind: "nav";
	/** Single segment naming the nav, e.g. "plan" or "item". */
	name: string;
	quantifier: Quantifier;
	child: IRNode;
};

export type IRNode = IRLeaf | IRAnd | IROr | IRNav;
