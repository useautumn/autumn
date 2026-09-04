import { Lang, parse } from "@ast-grep/napi";

const NAMED_IMPORT = /^import\s+\{([^}]*)\}\s*from\s*["']([^"']+)["']/;
const GENERATED_MODULE = /\/generated\/[A-Za-z]+$/;
const PACKAGE_NAME = "atmn-nightly";

/**
 * A file that gains an inline `plan({...})` must import `plan`. The specifier
 * follows the file's own builder imports: `<x>/generated/wire` → `<x>/generated/plans`,
 * the package → the same package import; a file with neither gets the package.
 */
export const ensureBuilderImport = ({
	source,
	builder,
	collection,
}: {
	source: string;
	builder: string;
	collection: string;
}): string => {
	const root = parse(Lang.TypeScript, source).root();
	const statements = root.findAll({ rule: { kind: "import_statement" } });
	const parsed = statements.flatMap((statement) => {
		const match = NAMED_IMPORT.exec(statement.text());
		return match
			? [
					{
						statement,
						names: match[1].split(",").map((n) => n.trim()),
						specifier: match[2],
					},
				]
			: [];
	});
	const imported = parsed.some((entry) =>
		entry.names.some(
			(name) => name === builder || name.startsWith(`${builder} as `),
		),
	);
	if (imported) return source;

	const packageImport = parsed.find(
		(entry) => entry.specifier === PACKAGE_NAME,
	);
	if (packageImport !== undefined) {
		const text = packageImport.statement.text();
		const widened = text.replace(/\{\s*/, `{ ${builder}, `);
		return root.commitEdits([
			{
				startPos: packageImport.statement.range().start.index,
				endPos: packageImport.statement.range().end.index,
				insertedText: widened,
			},
		]);
	}
	const generated = parsed.find((entry) =>
		GENERATED_MODULE.test(entry.specifier),
	);
	const line =
		generated === undefined
			? `import { ${builder} } from "${PACKAGE_NAME}";\n`
			: `import { ${builder} } from "${generated.specifier.replace(GENERATED_MODULE, `/generated/${collection}`)}";\n`;
	const anchor = generated?.statement ?? statements[0];
	const at = anchor === undefined ? 0 : anchor.range().end.index + 1;
	return `${source.slice(0, at)}${line}${source.slice(at)}`;
};
