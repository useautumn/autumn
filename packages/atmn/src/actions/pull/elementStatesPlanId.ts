import { Lang, parse, type SgNode } from "@ast-grep/napi";
import { fixturePropertyString } from "../../surgery/patchFixtureProperty";
import { importedFrom, moduleFileOf } from "./resolveCollectionTarget";

const callStatesId = ({
	node,
	builder,
	idField,
	id,
}: {
	node: SgNode;
	builder: string;
	idField: string;
	id: string;
}): boolean =>
	node.kind() === "call_expression" &&
	node.field("function")?.text() === builder &&
	fixturePropertyString({ call: node, property: idField }) === id;

const bindingValue = ({
	root,
	name,
}: {
	root: SgNode;
	name: string;
}): SgNode | null =>
	root
		.findAll({ rule: { kind: "variable_declarator" } })
		.find((declarator) => declarator.field("name")?.text() === name)
		?.field("value") ?? null;

/**
 * Whether a collection element is a fixture of this plan: an inline builder
 * call, or a name bound to one in this file or a relative module it imports.
 */
export const elementStatesPlanId = ({
	element,
	file,
	files,
	builder,
	idField,
	id,
}: {
	element: SgNode;
	file: string;
	files: Map<string, string>;
	builder: string;
	idField: string;
	id: string;
}): boolean => {
	if (element.kind() !== "identifier")
		return callStatesId({ node: element, builder, idField, id });
	const root = parse(Lang.TypeScript, files.get(file) ?? "").root();
	const local = bindingValue({ root, name: element.text() });
	if (local !== null)
		return callStatesId({ node: local, builder, idField, id });
	const imported = importedFrom({ root, name: element.text() });
	if (imported === null) return false;
	const moduleFile = moduleFileOf({
		from: file,
		specifier: imported.specifier,
		files,
	});
	if (moduleFile === null) return false;
	const module = parse(Lang.TypeScript, files.get(moduleFile) ?? "").root();
	const exported = bindingValue({ root: module, name: imported.exportedName });
	return (
		exported !== null && callStatesId({ node: exported, builder, idField, id })
	);
};
