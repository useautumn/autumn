import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ORDER_INSENSITIVE_SIDE_EFFECT_IMPORTS } from "./externals.ts";

type MetafileInputs = Record<
	string,
	{
		format?: string;
		imports: { path: string; kind: string; original?: string }[];
	}
>;

// A bundle makes every inlined module's main-module check true or undefined, so CLI code could run at boot.
const MAIN_MODULE_CHECK = /import\.meta\.main|require\.main\s*===?\s*module/;

const escapeRegExp = (text: string) =>
	text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isSideEffectOnlyImport = ({
	source,
	specifier,
}: {
	source: string;
	specifier: string;
}) =>
	new RegExp(`^\\s*import\\s+["']${escapeRegExp(specifier)}["']`, "m").test(
		source,
	);

/** CommonJS imported only for side effects; an inlined copy runs after its ESM siblings, unlike source. */
const reorderedSideEffectImports = ({
	inputs,
	file,
	source,
}: {
	inputs: MetafileInputs;
	file: string;
	source: string;
}) =>
	(inputs[file]?.imports ?? [])
		.filter((imported) => imported.kind === "import-statement")
		.filter((imported) => inputs[imported.path]?.format === "cjs")
		.map((imported) => imported.original ?? imported.path)
		.filter((specifier) => isSideEffectOnlyImport({ source, specifier }))
		.filter(
			(specifier) => !ORDER_INSENSITIVE_SIDE_EFFECT_IMPORTS.includes(specifier),
		);

/** Fails when inlining would make a module evaluate differently than it does from source. */
export const assertSourceSemanticsPreserved = ({
	entryName,
	inputs,
}: {
	entryName: string;
	inputs: MetafileInputs;
}) => {
	const problems = Object.keys(inputs).flatMap((file) => {
		const source = readFileSync(resolve(file), "utf8");
		const mainCheck = MAIN_MODULE_CHECK.test(source)
			? [`${file}: checks for the main module`]
			: [];
		const reordered =
			inputs[file]?.format === "esm"
				? reorderedSideEffectImports({ inputs, file, source }).map(
						(specifier) =>
							`${file}: side-effect import of CommonJS "${specifier}" would run out of order`,
					)
				: [];
		return [...mainCheck, ...reordered];
	});

	if (problems.length > 0) {
		throw new Error(
			`${entryName} can't be bundled as-is; externalize or fix:\n${problems.join("\n")}`,
		);
	}
};
