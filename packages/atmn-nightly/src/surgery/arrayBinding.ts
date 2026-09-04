import type { SgNode } from "@ast-grep/napi";

/** The array literal initializing `const name` (typed or not, exported or
 * not); null when no such declaration holds an array literal. */
export const findArrayBinding = ({
	root,
	name,
}: {
	root: SgNode;
	name: string;
}): SgNode | null => {
	for (const declarator of root.findAll({
		rule: { kind: "variable_declarator" },
	})) {
		if (declarator.field("name")?.text() !== name) continue;
		const value = declarator.field("value");
		if (value !== null && value.kind() === "array") return value;
	}
	return null;
};
