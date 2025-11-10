#!/usr/bin/env bun

import { $ } from "bun";
import chalk from "chalk";
import { readdir } from "fs/promises";
import pLimit from "p-limit";
import { resolve } from "path";

interface TestResult {
	file: string;
	status: "pending" | "running" | "passed" | "failed";
	duration: number;
	error?: string;
	output?: string; // Full test output for failed tests
}

interface TestProgress {
	onTestStart?: (file: string) => void;
	onTestComplete?: (file: string, result: TestResult) => void;
}

/**
 * Collect test files from paths
 */
async function collectTestFiles(paths: string[]): Promise<string[]> {
	const testFiles: string[] = [];

	for (const path of paths) {
		const resolvedPath = resolve(process.cwd(), path);

		if (path.endsWith(".test.ts")) {
			testFiles.push(resolvedPath);
			continue;
		}

		try {
			const files = await readdir(resolvedPath);
			for (const file of files) {
				if (file.endsWith(".test.ts")) {
					testFiles.push(resolve(resolvedPath, file));
				}
			}
		} catch (error) {
			// Ignore read errors
		}
	}

	return testFiles;
}

/**
 * Run a single test file using Bun Shell
 */
async function runTestFile(
	file: string,
	progress?: TestProgress,
): Promise<TestResult> {
	const startTime = performance.now();

	progress?.onTestStart?.(file);

	try {
		// Use Bun Shell to run the test with streaming output
		const result = await $`bun test --timeout 0 ${file}`.quiet().nothrow();

		const duration = performance.now() - startTime;

		if (result.exitCode === 0) {
			const testResult: TestResult = {
				file,
				status: "passed",
				duration,
			};
			progress?.onTestComplete?.(file, testResult);
			return testResult;
		}

		// Test failed - capture full output
		const stderr = result.stderr.toString();
		const stdout = result.stdout.toString();
		const fullOutput = `${stdout}\n${stderr}`.trim();

		// Extract error with stack trace for summary display
		const lines = fullOutput.split("\n");
		let errorLines: string[] = [];

		// First, look for the error message with Expected/Received
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (
				line.includes("error:") ||
				line.includes("Expected:") ||
				line.includes("Received:")
			) {
				// Capture error message lines
				errorLines = lines.slice(i, i + 4);
				break;
			}
		}

		// Then look for stack trace (lines with file paths and line numbers)
		const stackLines: string[] = [];
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			// Match patterns like "at functionName (/path/to/file.ts:123:45)"
			if (line.trim().startsWith("at ") && line.includes(".ts:")) {
				stackLines.push(line.trim());
				// Capture up to 5 stack frames
				if (stackLines.length >= 5) break;
			}
		}

		// Combine error message and stack trace
		if (stackLines.length > 0) {
			errorLines.push("", ...stackLines);
		}

		const error = errorLines.length > 0 ? errorLines.join("\n") : "Test failed";

		const testResult: TestResult = {
			file,
			status: "failed",
			duration,
			error,
			output: fullOutput, // Include full output for debugging
		};
		progress?.onTestComplete?.(file, testResult);
		return testResult;
	} catch (error) {
		const duration = performance.now() - startTime;
		const testResult: TestResult = {
			file,
			status: "failed",
			duration,
			error: String(error),
		};
		progress?.onTestComplete?.(file, testResult);
		return testResult;
	}
}

/**
 * Run multiple test files in parallel
 */
export async function runTests(
	paths: string[],
	options: {
		maxParallel?: number;
		progress?: TestProgress;
	} = {},
): Promise<TestResult[]> {
	const { maxParallel = 6, progress } = options;

	const testFiles = await collectTestFiles(paths);

	if (testFiles.length === 0) {
		return [];
	}

	// Run tests with concurrency limit
	const limit = pLimit(maxParallel);
	const promises = testFiles.map((file) =>
		limit(() => runTestFile(file, progress)),
	);

	return await Promise.all(promises);
}

// CLI usage
if (import.meta.main) {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		console.error(chalk.red("Error: No test directories specified"));
		console.log("Usage: bun runTestsV2.ts <dir1> [dir2] [...]");
		process.exit(1);
	}

	const results = await runTests(args, {
		progress: {
			onTestStart: (file) => {
				const fileName = file.split("/").pop();
				console.log(chalk.cyan(`⠋ ${fileName}`));
			},
			onTestComplete: (file, result) => {
				const fileName = file.split("/").pop();
				if (result.status === "passed") {
					console.log(chalk.green(`✓ ${fileName}`));
				} else {
					console.log(chalk.red(`✗ ${fileName}`));
					if (result.error) {
						console.log(chalk.yellow(`  ${result.error}`));
					}
				}
			},
		},
	});

	const passed = results.filter((r) => r.status === "passed").length;
	const failed = results.filter((r) => r.status === "failed").length;

	console.log(
		`\n${chalk.green(`✓ ${passed}`)} passed, ${failed > 0 ? chalk.red(`✗ ${failed}`) : chalk.dim(`✗ ${failed}`)} failed`,
	);

	process.exit(failed > 0 ? 1 : 0);
}
