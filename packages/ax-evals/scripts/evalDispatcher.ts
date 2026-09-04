#!/usr/bin/env bun

/**
 * `bun e <target>` — run ax-eval cases by folder or file, like `bun t` for
 * tests. A target resolves to a cases/ folder (suffix match: "basics",
 * "proGrowth", "suites/messagingApi"), a single eval file, or a case-name
 * fragment. Files are passed to braintrust explicitly because its own
 * directory scan misses our eval files.
 */

import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "bun";

const PACKAGE_ROOT = resolve(import.meta.dirname, "..");
const CASES_DIR = join(PACKAGE_ROOT, "cases");
const BRAINTRUST_BIN = resolve(
	PACKAGE_ROOT,
	"node_modules/.bin/braintrust",
);

const collectEvalFiles = async (dir: string): Promise<string[]> => {
	const files: string[] = [];
	for (const entry of await readdir(dir)) {
		const fullPath = join(dir, entry);
		if ((await stat(fullPath)).isDirectory()) {
			files.push(...(await collectEvalFiles(fullPath)));
		} else if (entry.endsWith(".eval.ts")) {
			files.push(fullPath);
		}
	}
	return files;
};

const findFolderBySuffix = async (
	dir: string,
	suffix: string,
): Promise<string | null> => {
	if (dir.endsWith(`/${suffix}`) || dir === join(CASES_DIR, suffix)) return dir;
	for (const entry of await readdir(dir)) {
		const fullPath = join(dir, entry);
		if (!(await stat(fullPath)).isDirectory()) continue;
		const found = await findFolderBySuffix(fullPath, suffix);
		if (found) return found;
	}
	return null;
};

const resolveTarget = async (target: string): Promise<string[]> => {
	// Exact file or directory path (absolute, cwd-relative, or cases-relative).
	for (const candidate of [
		resolve(process.cwd(), target),
		join(PACKAGE_ROOT, target),
		join(CASES_DIR, target),
	]) {
		if (!existsSync(candidate)) continue;
		if ((await stat(candidate)).isDirectory())
			return collectEvalFiles(candidate);
		if (candidate.endsWith(".eval.ts")) return [candidate];
	}

	// Folder anywhere under cases/ whose path ends with the target.
	const folder = await findFolderBySuffix(CASES_DIR, target);
	if (folder) return collectEvalFiles(folder);

	// Case-name fragment: cases/**/<something matching>.eval.ts
	const all = await collectEvalFiles(CASES_DIR);
	const lowered = target.toLowerCase();
	return all.filter((file) => file.toLowerCase().includes(lowered));
};

const listTargets = async () => {
	console.log("Usage: bun e <folder|file|fragment> [...braintrust args]\n");
	console.log("Folders under cases/:");
	const walk = async (dir: string, depth: number) => {
		for (const entry of (await readdir(dir)).sort()) {
			const fullPath = join(dir, entry);
			if ((await stat(fullPath)).isDirectory()) {
				console.log(`  ${"  ".repeat(depth)}${entry}`);
				await walk(fullPath, depth + 1);
			}
		}
	};
	await walk(CASES_DIR, 0);
};

const main = async () => {
	const args = process.argv.slice(2);
	const targets = args.filter((arg) => !arg.startsWith("-"));
	const options = args.filter((arg) => arg.startsWith("-"));

	if (targets.length === 0) {
		await listTargets();
		process.exit(0);
	}

	const files = [
		...new Set(
			(await Promise.all(targets.map(resolveTarget))).flat(),
		),
	];
	if (files.length === 0) {
		console.error(`No eval files matched: ${targets.join(", ")}`);
		process.exit(1);
	}
	console.log(`Running ${files.length} eval file(s):`);
	for (const file of files)
		console.log(`  ${file.replace(`${PACKAGE_ROOT}/`, "")}`);
	console.log("");

	const proc = spawn(
		[
			BRAINTRUST_BIN,
			"eval",
			...files,
			"--external-packages",
			"@anthropic-ai/claude-agent-sdk",
			...options,
		],
		{
			cwd: PACKAGE_ROOT,
			stdout: "inherit",
			stderr: "inherit",
			stdin: "inherit",
			env: {
				AX_EVALS_ARM: "with",
				// Parallel eval files interleave; collapse to one line per turn.
				...(files.length > 1 && { AX_EVALS_COMPACT: "1" }),
				...process.env,
			},
		},
	);
	process.exit(await proc.exited);
};

main();
