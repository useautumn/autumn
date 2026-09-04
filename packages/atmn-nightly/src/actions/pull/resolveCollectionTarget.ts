import { dirname, resolve } from "node:path";
import type { SgNode } from "@ast-grep/napi";
import { Lang, parse } from "@ast-grep/napi";
import { findArrayBinding } from "../../surgery/arrayBinding";

export type CollectionTarget =
	| { kind: "inline"; file: string }
	| { kind: "binding"; file: string; name: string };

const NAMED_IMPORT =
	/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/;

/**
 * Where a collection's array literal lives: inline in the atmn call, a const
 * the call names, or the const behind the array's last `...spread`; a named
 * const may be local or imported from a relative `.ts` file. Null when the
 * value is something this pull cannot append to.
 */
export const resolveCollectionTarget = ({
	configPath,
	files,
	collection,
}: {
	configPath: string;
	files: Map<string, string>;
	collection: string;
}): CollectionTarget | null => {
	const source = files.get(configPath);
	if (source === undefined) return null;
	const root = parse(Lang.TypeScript, source).root();
	const value = collectionValue({ root, collection });
	if (value === null) return null;
	if (value.kind() === "array") {
		const spread = trailingSpreadName(value);
		return spread === null
			? { kind: "inline", file: configPath }
			: resolveBinding({ root, name: spread, configPath, files });
	}
	// `atmn({ plans })` names the binding without a pair.
	const named =
		value.kind() === "identifier" ||
		value.kind() === "shorthand_property_identifier";
	if (!named) return null;
	return resolveBinding({ root, name: value.text(), configPath, files });
};

/** `[...a, ...b]` appends into `b`; a literal element last means inline. */
const trailingSpreadName = (array: SgNode): string | null => {
	const elements = array.namedChildren();
	const last = elements[elements.length - 1];
	if (last === undefined || last.kind() !== "spread_element") return null;
	const argument = last.namedChildren()[0];
	return argument?.kind() === "identifier" ? argument.text() : null;
};

const resolveBinding = ({
	root,
	name,
	configPath,
	files,
}: {
	root: SgNode;
	name: string;
	configPath: string;
	files: Map<string, string>;
}): CollectionTarget | null => {
	if (findArrayBinding({ root, name }) !== null)
		return { kind: "binding", file: configPath, name };
	const imported = importedFrom({ root, name });
	if (imported === null) return null;
	const file = moduleFileOf({
		from: configPath,
		specifier: imported.specifier,
		files,
	});
	if (file === null) return null;
	const module = parse(Lang.TypeScript, files.get(file) ?? "").root();
	return findArrayBinding({ root: module, name: imported.exportedName }) !==
		null
		? { kind: "binding", file, name: imported.exportedName }
		: null;
};

const collectionValue = ({
	root,
	collection,
}: {
	root: SgNode;
	collection: string;
}): SgNode | null => {
	const object = root.find("atmn($ARG)")?.getMatch("ARG") ?? null;
	if (object === null || object.kind() !== "object") return null;
	for (const member of object.children()) {
		if (
			member.kind() === "shorthand_property_identifier" &&
			member.text() === collection
		)
			return member;
		if (member.kind() !== "pair") continue;
		const [key, value] = member.namedChildren();
		if (key?.text() === collection && value !== undefined) return value;
	}
	return null;
};

/** The import binding `name`, with the name it had in the module it came from. */
const importedFrom = ({
	root,
	name,
}: {
	root: SgNode;
	name: string;
}): { specifier: string; exportedName: string } | null => {
	for (const statement of root.findAll({
		rule: { kind: "import_statement" },
	})) {
		const match = NAMED_IMPORT.exec(statement.text());
		if (match === null) continue;
		for (const entry of match[1].split(",")) {
			const [exportedName, localName = exportedName] = entry
				.trim()
				.split(/\s+as\s+/);
			if (localName === name && exportedName !== "")
				return { specifier: match[2], exportedName };
		}
	}
	return null;
};

/** A relative specifier against the walked files: bare, `.ts`, or a folder index. */
const moduleFileOf = ({
	from,
	specifier,
	files,
}: {
	from: string;
	specifier: string;
	files: Map<string, string>;
}): string | null => {
	if (!specifier.startsWith(".")) return null;
	const byResolved = new Map(
		[...files.keys()].map((file) => [resolve(file), file] as const),
	);
	const base = resolve(dirname(from), specifier);
	for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
		const file = byResolved.get(candidate);
		if (file !== undefined) return file;
	}
	return null;
};
