import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { Glob } from "bun";
import ts from "typescript";

const packageDirectory = new URL("../../src/", import.meta.url).pathname;

function readSource(file: string): ts.SourceFile {
	return ts.createSourceFile(
		file,
		readFileSync(file, "utf8"),
		ts.ScriptTarget.Latest,
		true,
	);
}

function kafkaUsesNamedFunctions(): void {
	const files = new Glob("**/*.ts").scanSync({
		cwd: packageDirectory,
		absolute: true,
	});
	const violations: string[] = [];
	for (const file of files) {
		const source = readSource(file);
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

function transportMechanicsStayDomainIndependent(): void {
	const violations: string[] = [];
	for (const file of new Glob("{client,consumer,producer}/**/*.ts").scanSync({
		cwd: packageDirectory,
		absolute: true,
	})) {
		for (const statement of readSource(file).statements) {
			if (
				!ts.isImportDeclaration(statement) ||
				!ts.isStringLiteral(statement.moduleSpecifier)
			)
				continue;
			const dependency = statement.moduleSpecifier.text;
			if (
				dependency.startsWith("@autumn/") ||
				dependency.includes("balance-worker") ||
				dependency.includes("/topics/")
			) {
				violations.push(`${file}: ${dependency}`);
			}
		}
	}
	expect(violations).toEqual([]);
}

test(
	"Kafka uses named functions without bind or callback promise chains",
	kafkaUsesNamedFunctions,
);
test(
	"transport mechanics do not depend on worker or topic logic",
	transportMechanicsStayDomainIndependent,
);
