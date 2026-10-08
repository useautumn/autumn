/**
 * Plumbing (threads, rings, frames, producers, commit positions) moves bytes and positions and never reaches
 * into business code; business code reaches it through one narrow interface. This scan keeps it that way.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { Glob } from "bun";
import ts from "typescript";

const SRC = new URL("../../../src/", import.meta.url).pathname;

/** Every plumbing folder, as each slice of the ring stack adds one. */
const PLUMBING = [
	"threads",
	"http/workerThreads",
	"kafka/producerThread",
	"runtime/commitPositions",
];

const BUSINESS_PACKAGES = [
	"@autumn/balance-engine",
	"@autumn/balance-worker-client",
];
const BUSINESS_FOLDERS = [
	"processor/",
	"http/handlers/",
	"http/replies/",
	"http/commands/",
];
/** The writer's own port, which the commit positions implement. */
const ALLOWED = ["processor/writer/types/commitPositionSink"];

function importsOf({ file, text }: { file: string; text: string }): string[] {
	const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
	const specifiers: string[] = [];
	const pending: ts.Node[] = [source];
	while (pending.length > 0) {
		const node = pending.pop();
		if (!node) continue;
		const declared =
			(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
			node.moduleSpecifier &&
			ts.isStringLiteral(node.moduleSpecifier);
		if (declared)
			specifiers.push((node.moduleSpecifier as ts.StringLiteral).text);
		const dynamic =
			ts.isCallExpression(node) &&
			node.expression.kind === ts.SyntaxKind.ImportKeyword &&
			node.arguments[0] &&
			ts.isStringLiteral(node.arguments[0]);
		if (dynamic) specifiers.push((node.arguments[0] as ts.StringLiteral).text);
		pending.push(...node.getChildren(source));
	}
	return specifiers;
}

/** The business imports of one plumbing file, as `file -> import`. */
function violationsOf({
	file,
	text,
}: {
	file: string;
	text: string;
}): string[] {
	const violations: string[] = [];
	for (const specifier of importsOf({ file, text })) {
		const target = specifier.startsWith(".")
			? relative(SRC, join(dirname(file), specifier)).replace(/\.(js|ts)$/, "")
			: specifier;
		const business =
			BUSINESS_PACKAGES.some(
				(name) => target === name || target.startsWith(`${name}/`),
			) ||
			(BUSINESS_FOLDERS.some((folder) => target.startsWith(folder)) &&
				!ALLOWED.includes(target));
		if (business) violations.push(`${relative(SRC, file)} -> ${specifier}`);
	}
	return violations;
}

describe("layer boundary", () => {
	test("plumbing imports no business code", () => {
		const violations: string[] = [];
		for (const folder of PLUMBING) {
			const directory = join(SRC, folder);
			expect(existsSync(directory)).toBe(true);
			for (const file of new Glob("**/*.ts").scanSync({
				cwd: directory,
				absolute: true,
			}))
				violations.push(
					...violationsOf({ file, text: readFileSync(file, "utf8") }),
				);
		}
		expect(violations).toEqual([]);
	});

	test("the scan catches a business import, and lets the writer's port through", () => {
		const file = join(SRC, "threads/ring/example.ts");
		const text = [
			'import { computeTrack } from "@autumn/balance-engine";',
			'import type { TrackReply } from "@autumn/balance-worker-client/protocol";',
			'import { track } from "../../processor/commands/track.js";',
			'import { workerErrorOf } from "../../http/handlers/errorHandler/workerErrorOf.js";',
			'import type { CommitPositionSink } from "../../processor/writer/types/commitPositionSink.js";',
			'import { createRing } from "./createRing.js";',
			'const loaded = import("../../processor/types/partitionProcessor.js");',
		].join("\n");
		expect(violationsOf({ file, text }).sort()).toEqual([
			"threads/ring/example.ts -> ../../http/handlers/errorHandler/workerErrorOf.js",
			"threads/ring/example.ts -> ../../processor/commands/track.js",
			"threads/ring/example.ts -> ../../processor/types/partitionProcessor.js",
			"threads/ring/example.ts -> @autumn/balance-engine",
			"threads/ring/example.ts -> @autumn/balance-worker-client/protocol",
		]);
	});
});
