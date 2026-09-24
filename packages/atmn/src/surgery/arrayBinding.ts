import type { SgNode } from "@ast-grep/napi";

/** The literal of `kind` initializing `const name` (typed or not, exported or
 * not); null when no such declaration holds one. */
export const findLiteralBinding = ({
	root,
	name,
	kind,
}: {
	root: SgNode;
	name: string;
	kind: "array" | "object";
}): SgNode | null => {
	for (const declarator of root.findAll({
		rule: { kind: "variable_declarator" },
	})) {
		if (declarator.field("name")?.text() !== name) continue;
		const value = declarator.field("value");
		if (value !== null && value.kind() === kind) return value;
	}
	return null;
};

export const findArrayBinding = ({
	root,
	name,
}: {
	root: SgNode;
	name: string;
}): SgNode | null => findLiteralBinding({ root, name, kind: "array" });
