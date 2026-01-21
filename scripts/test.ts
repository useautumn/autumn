#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { loadLocalEnv } from "@server/utils/envUtils.js";
import chalk from "chalk";

loadLocalEnv();

/**
 * Recursively finds all test files in a directory
 */
function findTestFiles({ dir }: { dir: string }): string[] {
	const files: string[] = [];
	const entries = readdirSync(dir);

	for (const entry of entries) {
		const fullPath = join(dir, entry);
		const stat = statSync(fullPath);

		if (stat.isDirectory()) {
			files.push(...findTestFiles({ dir: fullPath }));
		} else if (
			entry.endsWith(".ts") &&
			!entry.includes("Utils") &&
			!entry.includes("utils")
		) {
			files.push(fullPath);
		}
	}

	return files;
}

/**
 * Fuzzy matches a search term against test file paths and returns a score
 */
function fuzzyMatchScore({
	search,
	filePath,
}: {
	search: string;
	filePath: string;
}): number {
	const searchLower = search.toLowerCase();
	const pathLower = filePath.toLowerCase();
	const fileName = pathLower.split("/").pop() || "";

	// Check if path ends with the exact search pattern (highest priority for path-based searches)
	if (pathLower.endsWith(`${searchLower}.ts`)) {
		return 10000;
	}

	// Check if search matches exactly in filename
	if (fileName === `${searchLower}.ts`) {
		return 1000;
	}

	// Check if filename starts with search (high priority)
	if (fileName.startsWith(searchLower)) {
		return 500;
	}

	// Check if search is contained in filename
	if (fileName.includes(searchLower)) {
		return 100;
	}

	// Simple fuzzy match - check if all characters appear in order
	let searchIndex = 0;
	let score = 0;
	for (
		let i = 0;
		i < pathLower.length && searchIndex < searchLower.length;
		i++
	) {
		if (pathLower[i] === searchLower[searchIndex]) {
			searchIndex++;
			score++;
		}
	}

	// Return 0 if not all characters matched
	if (searchIndex !== searchLower.length) {
		return 0;
	}

	return score;
}

/**
 * Detects whether a test file uses Bun or Mocha framework
 */
function detectTestFramework({
	filePath,
}: {
	filePath: string;
}): "bun" | "mocha" {
	try {
		const { readFileSync } = require("node:fs");
		const content = readFileSync(filePath, "utf-8");
		// Check first 20 lines for bun:test import
		const lines = content.split("\n").slice(0, 20);
		const hasBunTest = lines.some(
			(line: string) =>
				line.includes('from "bun:test"') || line.includes("from 'bun:test'"),
		);
		return hasBunTest ? "bun" : "mocha";
	} catch (_error) {
		// Default to mocha if we can't read the file
		return "mocha";
	}
}

/**
 * Runs shell test scripts from server/shell/ directory or individual test files
 */
async function runTest() {
	const scriptName = process.argv[2];
	const additionalArgs = process.argv.slice(3);

	if (!scriptName) {
		console.log(
			chalk.red("❌ Please provide a shell script or test file name"),
		);
		console.log(
			chalk.cyan("\nUsage: bun tests <script-name|test-name|setup> [args...]"),
		);
		console.log(chalk.gray("Examples:"));
		console.log(
			chalk.gray("  bun tests setup           # run test setup script"),
		);
		console.log(chalk.gray("  bun tests g1"));
		console.log(chalk.gray("  bun tests g1 setup"));
		console.log(
			chalk.gray("  bun tests basic1          # fuzzy matches test file"),
		);
		console.log(
			chalk.gray("  bun tests attach/basic1   # matches path pattern\n"),
		);
		process.exit(1);
	}

	// Detect if we're already in the server directory (e.g., when run via server/run.sh)
	const cwd = process.cwd();
	const projectRoot =
		cwd.endsWith("/server") || cwd.endsWith("\\server")
			? resolve(cwd, "..")
			: cwd;
	const serverDir = resolve(projectRoot, "server");

	// Handle special "setup" command
	if (scriptName === "setup") {
		const setupScript = resolve(serverDir, "tests", "setupMain.ts");
		console.log(chalk.cyan("🏗️  Running test setup...\n"));

		const child = spawn("bun", [setupScript], {
			cwd: serverDir,
			stdio: "inherit",
			env: { ...process.env, NODE_ENV: "production" },
		});

		child.on("exit", (code) => {
			if (code === 0) {
				console.log(chalk.green("\n✅ Setup completed successfully"));
			} else {
				console.log(chalk.red(`\n❌ Setup failed with code ${code}`));
				process.exit(code || 1);
			}
		});

		child.on("error", (error) => {
			console.log(chalk.red(`\n❌ Error running setup: ${error.message}`));
			process.exit(1);
		});
		return;
	}

	const shellScript = resolve(
		projectRoot,
		"scripts",
		"testGroups",
		`${scriptName}.sh`,
	);

	// First try to find a shell script
	if (existsSync(shellScript)) {
		const argsDisplay =
			additionalArgs.length > 0 ? ` ${additionalArgs.join(" ")}` : "";
		console.log(
			chalk.cyan(`🧪 Running shell script: ${scriptName}.sh${argsDisplay}\n`),
		);

		const child = spawn("bash", [shellScript, ...additionalArgs], {
			cwd: projectRoot,
			stdio: "inherit",
			env: { ...process.env, NODE_ENV: "production" },
		});

		// Forward termination signals to child process
		process.on("SIGINT", () => {
			console.log(chalk.yellow("\n⚠️  Received SIGINT, stopping tests...\n"));
			child.kill("SIGINT");
			process.exit(130);
		});

		process.on("SIGTERM", () => {
			console.log(chalk.yellow("\n⚠️  Received SIGTERM, stopping tests...\n"));
			child.kill("SIGTERM");
			process.exit(143);
		});

		child.on("exit", (code) => {
			if (code === 0) {
				console.log(
					chalk.green(`\n✅ Test ${scriptName} completed successfully`),
				);
			} else {
				console.log(
					chalk.red(`\n❌ Test ${scriptName} failed with code ${code}`),
				);
				process.exit(code || 1);
			}
		});

		child.on("error", (error) => {
			console.log(chalk.red(`\n❌ Error running test: ${error.message}`));
			process.exit(1);
		});
		return;
	}

	// If not a shell script, try fuzzy matching test files
	console.log(
		chalk.cyan(`🔍 Searching for test file matching: ${scriptName}\n`),
	);

	const testsDir = resolve(serverDir, "tests");
	const allTestFiles = findTestFiles({ dir: testsDir });

	// Find matches with scores
	const matches = allTestFiles
		.map((file) => ({
			path: file,
			relative: relative(serverDir, file),
			score: fuzzyMatchScore({ search: scriptName, filePath: file }),
		}))
		.filter((match) => match.score > 0)
		.sort((a, b) => b.score - a.score);

	if (matches.length === 0) {
		console.log(chalk.red(`❌ No test file found matching: ${scriptName}`));
		console.log(chalk.gray(`   Searched in: ${testsDir}\n`));
		process.exit(1);
	}

	const bestMatch = matches[0];
	const otherMatches = matches.slice(1, 5);

	if (otherMatches.length > 0) {
		console.log(
			chalk.yellow(`⚠️  Multiple matches found, picking best match:\n`),
		);
		console.log(chalk.green(`   ✓ ${bestMatch.relative} (selected)`));
		for (const match of otherMatches) {
			console.log(chalk.gray(`     ${match.relative}`));
		}
		console.log();
	}

	const testFile = bestMatch;
	console.log(chalk.green(`✓ Found: ${testFile.relative}\n`));

	// Detect test framework
	const framework = detectTestFramework({ filePath: testFile.path });
	const frameworkLabel = framework === "bun" ? "Bun" : "Mocha";
	console.log(chalk.cyan(`🧪 Running test file with ${frameworkLabel}...\n`));

	if (framework !== "bun") {
		console.error(chalk.red("❌ Mocha tests are deprecated"));
		process.exit(1);
	}

	// Run the test file with the appropriate framework, wrapped with Infisical
	// Respect NODE_ENV from parent process (e.g., development for logging)
	const child = spawn("bun", ["test", "--timeout", "0", testFile.relative], {
		cwd: serverDir,
		stdio: "inherit",
		env: process.env,
	});

	// Store the process group ID
	const pgid = child.pid;

	// Forward termination signals to entire process group
	const killProcessGroup = () => {
		if (pgid) {
			try {
				// Kill the entire process group with SIGKILL (force kill)
				process.kill(-pgid, "SIGKILL");
			} catch (_err) {
				// Process group might already be dead
			}
		}
	};

	process.on("SIGINT", () => {
		console.log(
			chalk.yellow("\n⚠️  Received SIGINT, killing test process...\n"),
		);
		killProcessGroup();
		process.exit(130);
	});

	process.on("SIGTERM", () => {
		console.log(
			chalk.yellow("\n⚠️  Received SIGTERM, killing test process...\n"),
		);
		killProcessGroup();
		process.exit(143);
	});

	process.on("exit", () => {
		killProcessGroup();
	});

	child.on("exit", (code) => {
		if (code === 0) {
			console.log(
				chalk.green(`\n✅ Test ${scriptName} completed successfully`),
			);
		} else {
			console.log(
				chalk.red(`\n❌ Test ${scriptName} failed with code ${code}`),
			);
			process.exit(code || 1);
		}
	});

	child.on("error", (error) => {
		console.log(chalk.red(`\n❌ Error running test: ${error.message}`));
		process.exit(1);
	});
}

runTest();

// framework === "bun"
// ?
// : spawn(
// 		"infisical",
// 		[
// 			"run",
// 			"--env=dev",
// 			"--",
// 			"npx",
// 			"mocha",
// 			"--bail",
// 			"--timeout",
// 			"10000000",
// 			testFile.relative,
// 		],
// 		{
// 			cwd: serverDir,
// 			stdio: "inherit",
// 			env: { ...process.env, NODE_ENV: "production" },
// 		},
// 	);
