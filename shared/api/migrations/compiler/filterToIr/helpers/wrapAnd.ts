import type { IRNode } from "../../ir/irTypes.js";

export function wrapAnd(children: IRNode[]): IRNode {
	if (children.length === 0)
		throw new Error("Empty filter scope: at least one field is required");
	if (children.length === 1) return children[0];
	return { kind: "and", children };
}
