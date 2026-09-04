import { dirname, resolve } from "node:path";
import type { SgNode } from "@ast-grep/napi";
import { Lang, parse } from "@ast-grep/napi";

export type CollectionTarget =
	| { kind: "inline"; file: string }
	| { kind: "binding"; file: string; name: string };

const NAMED_IMPORT =
	/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/;

/**
 * Where a collection's array literal lives: inline in the atmn call, or a
 * const the call names, in the config or in a file it imports. Null when the
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
	if (value.kind() === "array") return { kind: "inline", file: configPath };
	if (value.kind() !== "identifier") return null;
	const name = value.text();
	if (declaresArray({ root, name }))
		return { kind: "binding", file: configPath, name };
	const specifier = importedFrom({ root, name });
	if (specifier === null) return null;
	const file = moduleFileOf({ from: configPath, specifier, files });
	if (file === null) return null;
	const imported = parse(Lang.TypeScript, files.get(file) ?? "").root();
	return declaresArray({ root: imported, name })
		? { kind: "binding", file, name }
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
	for (const pair of object.children()) {
		if (pair.kind() !== "pair") continue;
		const [key, value] = pair.namedChildren();
		if (key?.text() === collection && value !== undefined) return value;
	}
	return null;
};

const declaresArray = ({
	root,
	name,
}: {
	root: SgNode;
	name: string;
}): boolean => root.find(`const ${name} = [$$$ITEMS]`) !== null;

const importedFrom = ({
	root,
	name,
}: {
	root: SgNode;
	name: string;
}): string | null => {
	for (const statement of root.findAll({
		rule: { kind: "import_statement" },
	})) {
		const match = NAMED_IMPORT.exec(statement.text());
		if (match === null) continue;
		const names = match[1].split(",").map((entry) => entry.trim());
		const binds = names.some(
			(entry) => entry === name || entry.endsWith(` as ${name}`),
		);
		if (binds) return match[2];
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
