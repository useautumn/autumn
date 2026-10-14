export type LeafOp =
	| "eq"
	| "ne"
	| "in"
	| "nin"
	| "exists"
	| "gt"
	| "gte"
	| "lt"
	| "lte"
	| "startsWith"
	| "regex";

export type LeafValue =
	| string
	| number
	| boolean
	| null
	| readonly string[]
	| readonly number[];

export type IRLeaf = {
	kind: "leaf";
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
	name: string;
	quantifier: Quantifier;
	child: IRNode;
};

export type IRNode = IRLeaf | IRAnd | IROr | IRNav;
