import type { Edit } from "@ast-grep/napi";
import { Lang, parse } from "@ast-grep/napi";
import {
	importStatementOf,
	removeArrayElementEdits,
	removeLineEdit,
	removeSpecifierEdit,
} from "./fixtureEdit";

export const deleteReference = ({
	source,
	name,
}: {
	source: string;
	name: string;
}): string => {
	const root = parse(Lang.TypeScript, source).root();
	const edits: Array<Edit> = [];
	for (const identifier of root.findAll({
		rule: { kind: "identifier", pattern: name },
	})) {
		const parent = identifier.parent();
		if (parent === null || parent.kind() !== "array") continue;
		const elementEdits = removeArrayElementEdits({
			source,
			element: identifier,
		});
		if (elementEdits !== null) edits.push(...elementEdits);
	}
	for (const specifier of root.findAll({
		rule: { kind: "import_specifier" },
	})) {
		if (specifier.text() !== name) continue;
		const imports = specifier.parent();
		if (imports !== null && imports.namedChildren().length === 1) {
			const statement = importStatementOf(specifier);
			if (statement !== null)
				edits.push(removeLineEdit({ source, node: statement }));
		} else {
			edits.push(removeSpecifierEdit({ source, specifier }));
		}
	}
	return root.commitEdits(edits);
};
