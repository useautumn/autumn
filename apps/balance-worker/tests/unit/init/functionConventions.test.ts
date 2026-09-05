import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Glob } from "bun";
import ts from "typescript";

function initUsesNamedFunctions(): void {
	const directory = new URL("../../../src/init/", import.meta.url).pathname;
	const violations: string[] = [];
	const files = [
		...new Glob("**/*.ts").scanSync({
			cwd: directory,
			absolute: true,
		}),
	];
	files.push(new URL("../../../src/main.ts", import.meta.url).pathname);
	files.push(
		new URL(
			"../../../src/kafka/meteringConsumer/replay/createPartitionReplay.ts",
			import.meta.url,
		).pathname,
	);
	for (const file of files) {
		const source = ts.createSourceFile(
			file,
			readFileSync(file, "utf8"),
			ts.ScriptTarget.Latest,
			true,
		);
		const pending: ts.Node[] = [source];
		while (pending.length > 0) {
			const node = pending.pop();
			if (!node) continue;
			const anonymous =
				ts.isArrowFunction(node) ||
				ts.isFunctionExpression(node) ||
				(ts.isFunctionDeclaration(node) && !node.name);
			const inlineMethod =
				ts.isMethodDeclaration(node) &&
				ts.isObjectLiteralExpression(node.parent);
			const callbackWiring =
				ts.isCallExpression(node) &&
				ts.isPropertyAccessExpression(node.expression) &&
				["bind", "then", "catch", "finally"].includes(
					node.expression.name.text,
				);
			if (anonymous || inlineMethod || callbackWiring) {
				const { line } = source.getLineAndCharacterOfPosition(
					node.getStart(source),
				);
				violations.push(
					`${file}:${line + 1}: ${node.getText(source).slice(0, 80)}`,
				);
			}
			pending.push(...node.getChildren(source));
		}
	}
	expect(violations).toEqual([]);
}

test(
	"init uses named functions without bind or callback promise chains",
	initUsesNamedFunctions,
);
