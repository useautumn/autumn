// Copies @useautumn/sdk's tshy build into dist/sdk, one file per module, so
// bundlers can drop the operations and models a consumer never imports.
//
// Each dialect directory gets its own package.json: bundlers read `sideEffects`
// from the nearest package.json, and tshy's marks only the module type.
//
// Every model schema is wrapped in `z.lazy`, so importing the SDK builds one
// small wrapper per schema and each real schema is built on its first parse.
// Building all of them eagerly is most of the SDK's import cost.

import { cp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import * as path from "node:path";
import ts from "typescript";

const sdkDist = path.resolve(import.meta.dirname, "../../sdk/dist");
const target = path.resolve(import.meta.dirname, "../dist/sdk");

const dialects = [
	{ dir: "esm", type: "module" },
	{ dir: "commonjs", type: "commonjs" },
] as const;

// tshy's source maps point at ../sdk/src, which this package does not ship, so
// they are dropped along with the comments that reference them.
const sourceMapComment = /\n\/\/# sourceMappingURL=\S+\s*$/;

const isSchemaName = (name: string) => /\$(inbound|outbound)Schema$/.test(name);

const isLazy = (node: ts.Expression, file: ts.SourceFile) =>
	ts.isCallExpression(node) && node.expression.getText(file) === "z.lazy";

/**
 * The initializers of the module's top-level schema exports: `export const X =`
 * in ESM, `exports.X =` in CommonJS (skipping tsc's `exports.X = void 0`
 * hoisting).
 */
const schemaInitializers = (file: ts.SourceFile): Array<ts.Expression> => {
	const found: Array<ts.Expression> = [];
	for (const statement of file.statements) {
		if (ts.isVariableStatement(statement)) {
			const exported = statement.modifiers?.some(
				(modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
			);
			if (!exported) continue;
			for (const declaration of statement.declarationList.declarations) {
				if (
					ts.isIdentifier(declaration.name) &&
					isSchemaName(declaration.name.text) &&
					declaration.initializer
				) {
					found.push(declaration.initializer);
				}
			}
		} else if (
			ts.isExpressionStatement(statement) &&
			ts.isBinaryExpression(statement.expression) &&
			statement.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
		) {
			const { left, right } = statement.expression;
			if (
				ts.isPropertyAccessExpression(left) &&
				left.expression.getText(file) === "exports" &&
				isSchemaName(left.name.text) &&
				!ts.isVoidExpression(right) &&
				!ts.isBinaryExpression(right)
			) {
				found.push(right);
			}
		}
	}
	return found;
};

/** Returns the source with every schema export wrapped, and how many were. */
const lazify = (name: string, source: string) => {
	const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true);
	const edits = schemaInitializers(file)
		.filter((initializer) => !isLazy(initializer, file))
		.map(
			(initializer) =>
				[initializer.getStart(file), initializer.getEnd()] as const,
		)
		.reverse();
	let out = source;
	for (const [start, end] of edits) {
		out = `${out.slice(0, start)}z.lazy(() => ${out.slice(start, end)})${out.slice(end)}`;
	}
	return { source: out, wrapped: edits.length };
};

await rm(target, { recursive: true, force: true });

const wrappedByDialect: Record<string, number> = {};

for (const { dir, type } of dialects) {
	const out = path.join(target, dir);
	await cp(path.join(sdkDist, dir), out, {
		recursive: true,
		filter: (source) => !source.endsWith(".map"),
	});
	let wrapped = 0;
	const files = await readdir(out, { recursive: true });
	for (const file of files) {
		if (!file.endsWith(".js") && !file.endsWith(".d.ts")) continue;
		const filePath = path.join(out, file);
		const source = await readFile(filePath, "utf8");
		let next = source.replace(sourceMapComment, "\n");
		if (file.startsWith(`models${path.sep}`) && file.endsWith(".js")) {
			const result = lazify(file, next);
			next = result.source;
			wrapped += result.wrapped;
		}
		if (next !== source) await writeFile(filePath, next);
	}
	wrappedByDialect[dir] = wrapped;
	await writeFile(
		path.join(out, "package.json"),
		`${JSON.stringify({ type, sideEffects: false }, null, "\t")}\n`,
	);
}

// Both dialects compile the same models, so a mismatch or an empty count means
// the emitted shape changed and schemas are being built eagerly again.
const { esm, commonjs } = wrappedByDialect;
if (!esm || esm !== commonjs) {
	throw new Error(
		`pack-sdk: expected the same non-zero number of lazy schemas in each dialect, got esm=${esm} commonjs=${commonjs}`,
	);
}
console.log(`pack-sdk: ${esm} model schemas made lazy`);
