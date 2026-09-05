import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { TrackCommand } from "@autumn/balance-engine";
import { Glob } from "bun";
import ts from "typescript";
import { parseWorkerRequest, WorkerProtocolError } from "../src/protocol.js";

export const command: TrackCommand = {
	schemaVersion: 1,
	type: "track",
	commandId: "command",
	requestId: "request",
	identity: { orgId: "org", env: "sandbox", customerId: "customer" },
	entityId: null,
	featureId: "feature",
	value: 1,
	overageBehavior: "reject",
	properties: null,
	occurredAt: 0,
};

function preservesEnvelopes(): void {
	const route = { partition: 2, routeEpoch: "9007199254740993" };
	const input = {
		route,
		command: { type: "check", identity: command.identity },
	};
	expect(parseWorkerRequest({ input })).toEqual(input);
	expect(parseWorkerRequest({ input: { route, command } })).toEqual({
		route,
		command,
	});
}

function rejectsInvalidRoutes(): void {
	for (const routeEpoch of ["01", "-1", "+1", "1.0", "1e3", "", " 1", 1]) {
		function parse(): void {
			parseWorkerRequest({
				input: { route: { partition: 0, routeEpoch }, command },
			});
		}
		expect(parse).toThrow();
	}
	for (const partition of [
		-1,
		0.5,
		Number.MAX_SAFE_INTEGER + 1,
		Infinity,
		NaN,
		"0",
	]) {
		function parse(): void {
			parseWorkerRequest({
				input: { route: { partition, routeEpoch: "0" }, command },
			});
		}
		expect(parse).toThrow(WorkerProtocolError);
	}
}

function rejectsInvalidRequestEnvelopes(): void {
	const route = { partition: 0, routeEpoch: "1" };
	for (const input of [
		null,
		[],
		"request",
		{},
		{ route },
		{ command },
		{ route, command, extra: true },
		{ route: null, command },
		{ route: [], command },
		{ route: { partition: 0 }, command },
		{ route: { ...route, extra: true }, command },
	]) {
		function parse(): void {
			parseWorkerRequest({ input });
		}
		expect(parse).toThrow(WorkerProtocolError);
	}
}

test("preserves generic commands and canonical epochs", preservesEnvelopes);
test(
	"the worker boundary rejects invalid partition routes",
	rejectsInvalidRoutes,
);
test(
	"strictly decodes request and route envelopes",
	rejectsInvalidRequestEnvelopes,
);

function enforcesClientBoundaries(): void {
	const directory = new URL("../src/", import.meta.url).pathname;
	const violations: string[] = [];
	for (const file of new Glob("**/*.ts").scanSync({
		cwd: directory,
		absolute: true,
	})) {
		const source = ts.createSourceFile(
			file,
			readFileSync(file, "utf8"),
			ts.ScriptTarget.Latest,
			true,
		);
		const pending: ts.Node[] = [source];
		while (pending.length) {
			const node = pending.pop();
			if (!node) continue;
			const inlineFunction =
				ts.isArrowFunction(node) ||
				ts.isFunctionExpression(node) ||
				(ts.isMethodDeclaration(node) &&
					ts.isObjectLiteralExpression(node.parent));
			const callbackWiring =
				ts.isCallExpression(node) &&
				ts.isPropertyAccessExpression(node.expression) &&
				["bind", "then", "catch", "finally"].includes(
					node.expression.name.text,
				);
			if (inlineFunction || callbackWiring)
				violations.push(`${file}: ${node.getText(source).slice(0, 80)}`);
			if (
				ts.isImportDeclaration(node) &&
				ts.isStringLiteral(node.moduleSpecifier)
			) {
				const dependency = node.moduleSpecifier.text;
				if (dependency === "zod" || dependency.startsWith("zod/"))
					violations.push(`${file}: client imports ${dependency}`);
				if (
					dependency === "@autumn/balance-engine" &&
					!node.importClause?.isTypeOnly
				)
					violations.push(`${file}: client imports engine runtime logic`);
				if (
					file.includes("/http/") &&
					(dependency.startsWith("@autumn/") ||
						dependency.includes("/routing/") ||
						dependency.includes("/contracts/"))
				)
					violations.push(`${file}: HTTP imports ${dependency}`);
				if (
					file.includes("/contracts/") &&
					dependency.startsWith("@autumn/") &&
					dependency !== "@autumn/balance-engine"
				)
					violations.push(`${file}: contract imports ${dependency}`);
			}
			pending.push(...node.getChildren(source));
		}
	}
	expect(violations).toEqual([]);
}

test(
	"client uses named direct calls and keeps HTTP/domain boundaries separate",
	enforcesClientBoundaries,
);
