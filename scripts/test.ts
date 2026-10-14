#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { loadLocalEnv } from "@server/utils/envUtils.js";
import chalk from "chalk";

loadLocalEnv();

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

	if (pathLower.endsWith(`${searchLower}.ts`)) {
		return 10000;
	}

	if (fileName === `${searchLower}.ts`) {
		return 1000;
	}

	if (fileName.startsWith(searchLower)) {
		return 500;
	}

	if (fileName.includes(searchLower)) {
		return 100;
	}

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

	if (searchIndex !== searchLower.length) {
		return 0;
	}

	return score;
}

function detectTestFramework({
	filePath,
}: {
	filePath: string;
}): "bun" | "mocha" {
	try {
		const { readFileSync } = require("node:fs");
		const content = readFileSync(filePath, "utf-8");
		const lines = content.split("\n").slice(0, 20);
		const hasBunTest = lines.some(
			(line: string) =>
				line.includes('from "bun:test"') || line.includes("from 'bun:test'"),
		);
		return hasBunTest ? "bun" : "mocha";
	} catch (_error) {
		return "mocha";
	}
}

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

	const cwd = process.cwd();
	const projectRoot =
		cwd.endsWith("/server") || cwd.endsWith("\\server")
			? resolve(cwd, "..")
			: cwd;
	const serverDir = resolve(projectRoot, "server");

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

	console.log(
		chalk.cyan(`🔍 Searching for test file matching: ${scriptName}\n`),
	);

	const testsDir = resolve(serverDir, "tests");
	const allTestFiles = findTestFiles({ dir: testsDir });

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

	const frameworkLabel = "Bun";
	console.log(chalk.cyan(`🧪 Running test file with ${frameworkLabel}...\n`));

	const child = spawn("bun", ["test", "--timeout", "0", testFile.relative], {
		cwd: serverDir,
		stdio: "inherit",
		env: process.env,
	});

	const pgid = child.pid;

	const killProcessGroup = () => {
		if (pgid) {
			try {
				process.kill(-pgid, "SIGKILL");
			} catch (_err) {}
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
