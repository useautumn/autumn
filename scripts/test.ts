#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import chalk from "chalk";

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

	// Check if search matches exactly in filename (highest priority)
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
			chalk.cyan("\nUsage: bun tests <script-name|test-name> [args...]"),
		);
		console.log(chalk.gray("Examples:"));
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

	const serverDir = resolve(process.cwd(), "server");
	const shellScript = resolve(serverDir, "shell", `${scriptName}.sh`);

	// First try to find a shell script
	if (existsSync(shellScript)) {
		const argsDisplay =
			additionalArgs.length > 0 ? ` ${additionalArgs.join(" ")}` : "";
		console.log(
			chalk.cyan(`🧪 Running shell script: ${scriptName}.sh${argsDisplay}\n`),
		);

		// Create a new process group by spawning with detached: true
		const child = spawn("bash", [shellScript, ...additionalArgs], {
			cwd: serverDir,
			stdio: "inherit",
			env: { ...process.env, NODE_ENV: "production" },
			detached: true,
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
			console.log(chalk.yellow("\n⚠️  Received SIGINT, killing all test processes...\n"));
			killProcessGroup();
			process.exit(130);
		});

		process.on("SIGTERM", () => {
			console.log(chalk.yellow("\n⚠️  Received SIGTERM, killing all test processes...\n"));
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
	console.log(chalk.cyan(`🧪 Running test file...\n`));

	// Run the test file with mocha
	const child = spawn("bunx", ["mocha", "--timeout", "0", testFile.path], {
		cwd: serverDir,
		stdio: "inherit",
		env: { ...process.env, NODE_ENV: "production" },
		detached: true,
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
		console.log(chalk.yellow("\n⚠️  Received SIGINT, killing test process...\n"));
		killProcessGroup();
		process.exit(130);
	});

	process.on("SIGTERM", () => {
		console.log(chalk.yellow("\n⚠️  Received SIGTERM, killing test process...\n"));
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
