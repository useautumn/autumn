#!/usr/bin/env bun

/**
 * Unified test dispatcher. Resolves the argument to one of:
 * 1. A test group/suite from server/tests/_groups/
 * 2. A legacy shell script from scripts/testGroups/
 * 3. A pattern-match fallback passed to runTestsV2.tsx
 */

import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "bun";
import {
	getGroup,
	resolveSuite,
	resolveTestPaths,
} from "../../server/tests/_groups/index";
import { testRunConfig } from "./testRunConfig";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");
const TESTS_DIR = join(PROJECT_ROOT, testRunConfig.testsBaseDir);
const LEGACY_SCRIPTS_DIR = join(PROJECT_ROOT, testRunConfig.legacyScriptsDir);
const RUNNER_SCRIPT = join(PROJECT_ROOT, "scripts/testScripts/runTestsV2.tsx");

/** Recursively find a file under baseDir whose relative path ends with the given suffix. */
async function findFileByPath({
	baseDir,
	pathSuffix,
}: {
	baseDir: string;
	pathSuffix: string;
}): Promise<string | null> {
	const normalizedSuffix = `/${pathSuffix}`;

	const walk = async ({ dir }: { dir: string }): Promise<string | null> => {
		try {
			const entries = await readdir(dir);
			for (const entry of entries) {
				const fullPath = join(dir, entry);
				const entryStat = await stat(fullPath);

				if (entryStat.isDirectory()) {
					const found = await walk({ dir: fullPath });
					if (found) return found;
				} else if (fullPath.endsWith(normalizedSuffix)) {
					return fullPath;
				}
			}
		} catch {
			// ignore
		}
		return null;
	};

	return walk({ dir: baseDir });
}

/** Resolve a group path (relative to server/tests/) into absolute file paths. */
async function resolveGroupPath({
	groupPath,
}: {
	groupPath: string;
}): Promise<string[]> {
	// Try exact path under server/tests/
	const exactPath = join(TESTS_DIR, groupPath);

	if (existsSync(exactPath)) {
		const s = await stat(exactPath);
		if (s.isFile() && groupPath.endsWith(".test.ts")) {
			return [exactPath];
		}
		if (s.isDirectory()) {
			return collectTestFilesFromDir({ dir: exactPath });
		}
	}

	// Try searching under server/tests/ for a matching file or folder
	if (groupPath.endsWith(".test.ts")) {
		const found = await findFileByPath({
			baseDir: TESTS_DIR,
			pathSuffix: groupPath,
		});
		if (found) return [found];
	} else {
		// Search for a matching directory
		const found = await findFolderByPath({
			baseDir: TESTS_DIR,
			pathSuffix: groupPath,
		});
		if (found) return collectTestFilesFromDir({ dir: found });
	}

	return [];
}

/** Recursively find a folder whose path ends with the given suffix. */
async function findFolderByPath({
	baseDir,
	pathSuffix,
}: {
	baseDir: string;
	pathSuffix: string;
}): Promise<string | null> {
	const normalizedSuffix = `/${pathSuffix}`;

	const walk = async ({ dir }: { dir: string }): Promise<string | null> => {
		try {
			const entries = await readdir(dir);
			for (const entry of entries) {
				const fullPath = join(dir, entry);
				const entryStat = await stat(fullPath);

				if (entryStat.isDirectory()) {
					if (fullPath.endsWith(normalizedSuffix)) {
						return fullPath;
					}
					const found = await walk({ dir: fullPath });
					if (found) return found;
				}
			}
		} catch {
			// ignore
		}
		return null;
	};

	return walk({ dir: baseDir });
}

/** Recursively collect all *.test.ts files from a directory. */
async function collectTestFilesFromDir({
	dir,
}: {
	dir: string;
}): Promise<string[]> {
	const files: string[] = [];

	const walk = async ({ d }: { d: string }) => {
		const entries = await readdir(d);
		for (const entry of entries) {
			const fullPath = join(d, entry);
			const entryStat = await stat(fullPath);

			if (entryStat.isDirectory()) {
				await walk({ d: fullPath });
			} else if (entry.endsWith(".test.ts")) {
				files.push(fullPath);
			}
		}
	};

	await walk({ d: dir });
	return files;
}

async function main() {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		console.log(
			"Usage: bun t <group|suite|script|pattern> [...] [--max=N] [--verbose]",
		);
		console.log("");
		console.log("Examples:");
		console.log("  bun t core              # run the 'core' test group");
		console.log("  bun t core-attach       # run the 'core-attach' test group");
		console.log("  bun t pre-merge         # run the 'pre-merge' test suite");
		console.log(
			"  bun t g1                # run legacy script scripts/testGroups/g1.sh",
		);
		console.log(
			"  bun t multi-attach      # pattern-match folders under server/tests/",
		);
		console.log("  bun t multi-attach --max=3 --verbose");
		process.exit(0);
	}

	// Separate options from positional args
	const options: string[] = [];
	const positionalArgs: string[] = [];
	let userMaxConcurrency: number | null = null;

	for (const arg of args) {
		if (arg.startsWith("--max=")) {
			const val = arg.split("=")[1];
			userMaxConcurrency = val ? Number.parseInt(val, 10) : null;
			options.push(arg);
		} else if (arg.startsWith("-")) {
			options.push(arg);
		} else {
			positionalArgs.push(arg);
		}
	}

	if (positionalArgs.length === 0) {
		console.error("Error: No test target specified");
		process.exit(1);
	}

	const resolvedFiles: string[] = [];
	const fallbackArgs: string[] = [];
	// Track the max concurrency from matched groups (use lowest if multiple)
	let groupMaxConcurrency: number | null = null;

	for (const arg of positionalArgs) {
		// Priority 1: Test group or suite from _groups/
		const groupPaths = resolveTestPaths({ name: arg });
		if (groupPaths) {
			console.log(
				`Matched test group/suite: "${arg}" (${groupPaths.length} path(s))`,
			);

			// Check for group-level maxConcurrency override
			const group = getGroup({ name: arg });
			if (group?.maxConcurrency) {
				groupMaxConcurrency =
					groupMaxConcurrency === null
						? group.maxConcurrency
						: Math.min(groupMaxConcurrency, group.maxConcurrency);
			}

			// If it's a suite, check all constituent groups for the lowest maxConcurrency
			const suiteGroups = resolveSuite({ name: arg });
			if (suiteGroups) {
				for (const g of suiteGroups) {
					if (g.maxConcurrency) {
						groupMaxConcurrency =
							groupMaxConcurrency === null
								? g.maxConcurrency
								: Math.min(groupMaxConcurrency, g.maxConcurrency);
					}
				}
			}

			const files: string[] = [];
			for (const p of groupPaths) {
				const resolved = await resolveGroupPath({ groupPath: p });
				files.push(...resolved);
			}

			const unique = [...new Set(files)];
			console.log(`Resolved to ${unique.length} test file(s)\n`);
			resolvedFiles.push(...unique);
			continue;
		}

		// Priority 2: Legacy shell script
		const scriptPath = join(LEGACY_SCRIPTS_DIR, `${arg}.sh`);
		if (existsSync(scriptPath)) {
			console.log(`Running legacy test script: scripts/testGroups/${arg}.sh\n`);

			const proc = spawn(["bash", scriptPath], {
				stdout: "inherit",
				stderr: "inherit",
				stdin: "inherit",
				env: { ...process.env },
			});

			const exitCode = await proc.exited;
			process.exit(exitCode);
		}

		// Priority 3: Fallback — pass to runTestsV2.tsx for pattern matching
		fallbackArgs.push(arg);
	}

	// Determine concurrency: user flag > group override > config default
	const concurrency =
		userMaxConcurrency ??
		groupMaxConcurrency ??
		testRunConfig.defaultConcurrency;

	// Build final options — inject --max if not already set by user
	const finalOptions =
		userMaxConcurrency !== null
			? options
			: [...options, `--max=${concurrency}`];

	if (resolvedFiles.length > 0 && fallbackArgs.length > 0) {
		const runnerArgs = [...resolvedFiles, ...fallbackArgs, ...finalOptions];
		await spawnRunner({ args: runnerArgs });
		return;
	}

	if (resolvedFiles.length > 0) {
		const runnerArgs = [...resolvedFiles, ...finalOptions];
		await spawnRunner({ args: runnerArgs });
		return;
	}

	if (fallbackArgs.length > 0) {
		console.log(`Pattern matching: "${fallbackArgs.join(", ")}"\n`);
		const runnerArgs = [...fallbackArgs, ...finalOptions];
		await spawnRunner({ args: runnerArgs });
		return;
	}
}

async function spawnRunner({ args }: { args: string[] }) {
	const proc = spawn(["bun", RUNNER_SCRIPT, ...args], {
		stdout: "inherit",
		stderr: "inherit",
		stdin: "inherit",
		env: { ...process.env },
	});

	const exitCode = await proc.exited;
	process.exit(exitCode);
}

main();
