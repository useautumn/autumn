#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { loadLocalEnv } from "@server/utils/envUtils.js";
import { spawn } from "bun";
import chalk from "chalk";
import dotenv from "dotenv";
import pLimit from "p-limit";

loadLocalEnv();

// Load environment variables from server/.env
dotenv.config({ path: resolve(process.cwd(), "server", ".env") });

// Base path for shorthand test paths
const INTEGRATION_TEST_BASE = "server/tests/integration/billing";

interface IndividualTest {
	name: string;
	status: "pending" | "running" | "passed" | "failed";
	duration?: number;
	error?: {
		message: string;
		location?: string; // file:line for cmd+click
		details?: string;
	};
}

interface TestFileResult {
	file: string;
	status: "pending" | "running" | "passed" | "failed";
	tests: IndividualTest[];
	currentTest?: string;
	output: string;
	duration: number;
}

class TestRunnerV2 {
	private results: Map<string, TestFileResult> = new Map();
	private testFiles: string[] = [];
	private maxParallel: number = 6;
	private spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
	private spinnerIndex = 0;
	private renderInterval?: Timer;
	private startLine = 0;
	private lastRenderedLines = 0;

	constructor(maxParallel?: number) {
		if (maxParallel) this.maxParallel = maxParallel;
	}

	async collectTestFiles(directories: string[]): Promise<string[]> {
		const testFiles: string[] = [];

		for (const dir of directories) {
			const resolvedDir = resolve(process.cwd(), dir);
			try {
				const files = await readdir(resolvedDir);
				for (const file of files) {
					if (file.endsWith(".test.ts")) {
						testFiles.push(resolve(resolvedDir, file));
					}
				}
			} catch (error) {
				console.error(chalk.red(`Error reading directory ${dir}:`), error);
			}
		}

		return testFiles;
	}

	private parseTestOutput(output: string, filePath: string): IndividualTest[] {
		const tests: IndividualTest[] = [];
		const lines = output.split("\n");

		// Track where each test result appears
		// Error output appears BEFORE the (fail) line in bun test output
		let lastTestEndIndex = -1;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			// Match (pass) or (fail) test results
			const passMatch = line.match(
				/^\(pass\)\s+(.+?)\s+\[(\d+(?:\.\d+)?m?s)\]/,
			);
			const failMatch = line.match(
				/^\(fail\)\s+(.+?)\s+\[(\d+(?:\.\d+)?m?s)\]/,
			);

			if (passMatch) {
				const [, name, duration] = passMatch;
				tests.push({
					name: name.trim(),
					status: "passed",
					duration: this.parseDuration(duration),
				});
				lastTestEndIndex = i;
			} else if (failMatch) {
				const [, name, duration] = failMatch;

				// Look BACKWARDS from this line to find the error output
				// Error appears between the last test result and this (fail) line
				const errorStartIndex = lastTestEndIndex + 1;
				const errorLines = lines.slice(errorStartIndex, i);

				const test: IndividualTest = {
					name: name.trim(),
					status: "failed",
					duration: this.parseDuration(duration),
				};

				// Parse the error from the lines before this (fail)
				this.parseErrorFromLines(test, errorLines, filePath);

				tests.push(test);
				lastTestEndIndex = i;
			}
		}

		return tests;
	}

	private parseErrorFromLines(
		test: IndividualTest,
		errorLines: string[],
		filePath: string,
	): void {
		const errorText = errorLines.join("\n");

		// Find error message - look for "error:" line
		let errorMessage = "";
		for (const line of errorLines) {
			const errorMatch = line.match(/^error:\s*(.+)/i);
			if (errorMatch) {
				errorMessage = errorMatch[1].trim();
				break;
			}
		}

		// Find Expected/Received for assertion errors
		const expectedMatch = errorText.match(/Expected:\s*(.+)/);
		const receivedMatch = errorText.match(/Received:\s*(.+)/);
		if (expectedMatch && receivedMatch) {
			errorMessage = `Expected: ${expectedMatch[1]}, Received: ${receivedMatch[1]}`;
		}

		// Check for timeout
		if (errorText.includes("this test timed out")) {
			errorMessage = "Test timed out";
		}

		// Find location - prioritize the test file itself in stack trace
		let location: string | undefined;
		const testFileName = basename(filePath);

		for (const line of errorLines) {
			// Match stack trace lines like:
			// at async <anonymous> (/path/to/file.test.ts:38:29)
			// at functionName (/path/to/file.ts:123:45)
			const stackMatch = line.match(/at\s+.*?\(([^)]+\.ts):(\d+):\d+\)/);
			if (stackMatch) {
				const matchedFile = stackMatch[1];
				const lineNum = stackMatch[2];

				// Prefer .test.ts files
				if (matchedFile.endsWith(".test.ts")) {
					location = `${matchedFile}:${lineNum}`;
					break;
				}

				// Otherwise take first server file if we don't have one yet
				if (!location && matchedFile.includes("/server/")) {
					location = `${matchedFile}:${lineNum}`;
				}
			}
		}

		test.error = {
			message: errorMessage || "Test failed",
			location,
			details: errorText.slice(0, 500),
		};
	}

	private parseDuration(duration: string): number {
		// Parse "123.45ms" or "1.23s" to milliseconds
		if (duration.endsWith("ms")) {
			return Number.parseFloat(duration);
		}
		if (duration.endsWith("s")) {
			return Number.parseFloat(duration) * 1000;
		}
		return Number.parseFloat(duration);
	}

	private extractCurrentTest(output: string): string | null {
		// Look for the last test that started (before pass/fail)
		const lines = output.split("\n");

		// Find last pass/fail to know what's completed
		let lastCompletedIndex = -1;
		for (let i = lines.length - 1; i >= 0; i--) {
			if (lines[i].match(/^\(pass\)/) || lines[i].match(/^\(fail\)/)) {
				lastCompletedIndex = i;
				break;
			}
		}

		// The "current" test would be indicated by the test that's running
		// Bun doesn't explicitly say which test is running, so we show the last completed
		if (lastCompletedIndex >= 0) {
			const match = lines[lastCompletedIndex].match(
				/^\((?:pass|fail)\)\s+(.+?)\s+\[/,
			);
			if (match) {
				return match[1].trim();
			}
		}

		return null;
	}

	private hideCursor() {
		process.stdout.write("\x1B[?25l");
	}

	private showCursor() {
		process.stdout.write("\x1B[?25h");
	}

	private moveCursor(line: number, col: number = 0) {
		process.stdout.write(`\x1B[${line};${col}H`);
	}

	private clearLine() {
		process.stdout.write("\x1B[2K");
	}

	private clearToEndOfScreen() {
		process.stdout.write("\x1B[J");
	}

	private truncate(str: string, maxLength: number): string {
		if (str.length <= maxLength) return str;
		return str.substring(0, maxLength - 3) + "...";
	}

	private render() {
		this.spinnerIndex = (this.spinnerIndex + 1) % this.spinnerFrames.length;
		const spinner = this.spinnerFrames[this.spinnerIndex];

		let lineNum = this.startLine;

		// Calculate stats - only count tests from COMPLETED files for accurate progress
		const runningFiles = Array.from(this.results.entries()).filter(
			([_, r]) => r.status === "running",
		);
		const completedFiles = Array.from(this.results.entries()).filter(
			([_, r]) => r.status === "passed" || r.status === "failed",
		);
		const pendingFiles = Array.from(this.results.entries()).filter(
			([_, r]) => r.status === "pending",
		);

		// Only count tests from completed files for stable progress
		const completedTests = completedFiles.flatMap(([_, r]) => r.tests);
		const passedTests = completedTests.filter(
			(t) => t.status === "passed",
		).length;
		const failedTests = completedTests.filter(
			(t) => t.status === "failed",
		).length;

		// Header
		this.moveCursor(lineNum, 0);
		this.clearLine();
		process.stdout.write(
			chalk.cyan.bold(`Running ${this.testFiles.length} test files...\n`),
		);
		lineNum++;

		// Blank line
		this.moveCursor(lineNum, 0);
		this.clearLine();
		process.stdout.write("\n");
		lineNum++;

		// Show running files with their current test
		if (runningFiles.length > 0) {
			this.moveCursor(lineNum, 0);
			this.clearLine();
			process.stdout.write(
				chalk.yellow.bold(`Running (${runningFiles.length}):\n`),
			);
			lineNum++;

			for (const [file, result] of runningFiles) {
				const fileName = basename(file);
				this.moveCursor(lineNum, 0);
				this.clearLine();

				// Show file with spinner
				let fileDisplay = `  ${chalk.cyan(spinner)} ${fileName}`;

				// Show completed tests count for this file
				const filePassedCount = result.tests.filter(
					(t) => t.status === "passed",
				).length;
				const fileFailedCount = result.tests.filter(
					(t) => t.status === "failed",
				).length;

				if (filePassedCount > 0 || fileFailedCount > 0) {
					fileDisplay += chalk.dim(
						` (${chalk.green(`✓${filePassedCount}`)}${fileFailedCount > 0 ? chalk.red(` ✗${fileFailedCount}`) : ""})`,
					);
				}

				// Show current/last test
				const currentTest = this.extractCurrentTest(result.output);
				if (currentTest) {
					fileDisplay += chalk.dim(` › ${this.truncate(currentTest, 40)}`);
				}

				process.stdout.write(`${fileDisplay}\n`);
				lineNum++;
			}

			// Blank line after running
			this.moveCursor(lineNum, 0);
			this.clearLine();
			process.stdout.write("\n");
			lineNum++;
		}

		// Show recently completed files (last 3)
		if (completedFiles.length > 0) {
			const recentCompleted = completedFiles.slice(-3);

			this.moveCursor(lineNum, 0);
			this.clearLine();
			process.stdout.write(
				chalk.dim(
					`Completed (${completedFiles.length}/${this.testFiles.length} files):\n`,
				),
			);
			lineNum++;

			for (const [file, result] of recentCompleted) {
				const fileName = basename(file);
				this.moveCursor(lineNum, 0);
				this.clearLine();

				const filePassedCount = result.tests.filter(
					(t) => t.status === "passed",
				).length;
				const fileFailedCount = result.tests.filter(
					(t) => t.status === "failed",
				).length;

				const icon =
					result.status === "passed" ? chalk.green("✓") : chalk.red("✗");
				const nameColor = result.status === "passed" ? chalk.dim : chalk.white;

				process.stdout.write(
					`  ${icon} ${nameColor(fileName)} ${chalk.dim(`(${chalk.green(`✓${filePassedCount}`)}${fileFailedCount > 0 ? chalk.red(` ✗${fileFailedCount}`) : ""})`)}\n`,
				);
				lineNum++;
			}

			// Blank line
			this.moveCursor(lineNum, 0);
			this.clearLine();
			process.stdout.write("\n");
			lineNum++;
		}

		// Show inline errors from recently completed files (compact view)
		const recentFailedTests = completedFiles
			.flatMap(([file, result]) =>
				result.tests
					.filter((t) => t.status === "failed")
					.map((t) => ({ ...t, file })),
			)
			.slice(-2); // Show last 2 failures

		if (recentFailedTests.length > 0) {
			this.moveCursor(lineNum, 0);
			this.clearLine();
			process.stdout.write(chalk.red.bold(`Recent Failures:\n`));
			lineNum++;

			for (const test of recentFailedTests) {
				this.moveCursor(lineNum, 0);
				this.clearLine();
				process.stdout.write(
					`  ${chalk.red("✗")} ${this.truncate(test.name, 50)}\n`,
				);
				lineNum++;

				if (test.error?.message) {
					this.moveCursor(lineNum, 0);
					this.clearLine();
					process.stdout.write(
						`    ${chalk.dim("→")} ${chalk.yellow(this.truncate(test.error.message, 60))}\n`,
					);
					lineNum++;
				}

				if (test.error?.location) {
					this.moveCursor(lineNum, 0);
					this.clearLine();
					process.stdout.write(
						`    ${chalk.dim("→")} ${chalk.cyan(test.error.location)}\n`,
					);
					lineNum++;
				}
			}

			// Blank line
			this.moveCursor(lineNum, 0);
			this.clearLine();
			process.stdout.write("\n");
			lineNum++;
		}

		// Progress bar
		this.moveCursor(lineNum, 0);
		this.clearLine();
		process.stdout.write(chalk.dim("─".repeat(60) + "\n"));
		lineNum++;

		this.moveCursor(lineNum, 0);
		this.clearLine();
		process.stdout.write(
			`${chalk.cyan(spinner)} Progress: ${chalk.bold(`${completedFiles.length}/${this.testFiles.length} files`)} | ` +
				`${chalk.green(`✓ ${passedTests}`)} | ` +
				`${failedTests > 0 ? chalk.red(`✗ ${failedTests}`) : chalk.dim(`✗ ${failedTests}`)} | ` +
				`${chalk.dim(`${runningFiles.length} running`)}\n`,
		);
		lineNum++;

		// Clear remaining lines
		this.moveCursor(lineNum, 0);
		this.clearToEndOfScreen();

		this.lastRenderedLines = lineNum - this.startLine;
	}

	async runTest(file: string): Promise<void> {
		const startTime = performance.now();

		// Initialize as running
		const result: TestFileResult = {
			file,
			status: "running",
			tests: [],
			output: "",
			duration: 0,
		};
		this.results.set(file, result);

		try {
			const proc = spawn(["bun", "test", "--timeout", "0", file], {
				stdout: "pipe",
				stderr: "pipe",
				env: { ...process.env },
			});

			let output = "";
			const decoder = new TextDecoder();

			if (proc.stdout) {
				for await (const chunk of proc.stdout) {
					const text = decoder.decode(chunk);
					output += text;
					result.output = output;

					// Parse tests as they complete
					result.tests = this.parseTestOutput(output, file);
					this.results.set(file, result);
				}
			}

			if (proc.stderr) {
				for await (const chunk of proc.stderr) {
					output += decoder.decode(chunk);
					result.output = output;
				}
			}

			await proc.exited;
			const duration = performance.now() - startTime;

			// Final parse
			const tests = this.parseTestOutput(output, file);
			const hasFailures = tests.some((t) => t.status === "failed");

			this.results.set(file, {
				...result,
				status: hasFailures ? "failed" : "passed",
				tests,
				output,
				duration,
			});
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.set(file, {
				...result,
				status: "failed",
				output: String(error),
				duration,
			});
		}
	}

	private cleanup() {
		if (this.renderInterval) {
			clearInterval(this.renderInterval);
		}
		this.showCursor();
	}

	private handleInterrupt() {
		this.cleanup();
		console.log(
			chalk.yellow.bold("\n\n⚠ Tests interrupted by user (Ctrl+C)\n"),
		);
		this.printSummary();
		process.exit(130);
	}

	async run(directories: string[]): Promise<void> {
		this.testFiles = await this.collectTestFiles(directories);

		if (this.testFiles.length === 0) {
			console.log(chalk.yellow("No test files found in specified directories"));
			return;
		}

		// Initialize all tests as pending
		for (const file of this.testFiles) {
			this.results.set(file, {
				file,
				status: "pending",
				tests: [],
				output: "",
				duration: 0,
			});
		}

		// Setup SIGINT handler
		const sigintHandler = () => this.handleInterrupt();
		process.on("SIGINT", sigintHandler);

		// Hide cursor and create initial space
		this.hideCursor();
		this.startLine = 1;

		// Create some initial space
		for (let i = 0; i < 20; i++) {
			console.log();
		}
		process.stdout.write("\x1B[20A");

		// Start rendering loop
		this.renderInterval = setInterval(() => this.render(), 100);

		// Run tests with concurrency limit
		const limit = pLimit(this.maxParallel);
		const promises = this.testFiles.map((file) =>
			limit(() => this.runTest(file)),
		);

		await Promise.all(promises);

		// Remove SIGINT handler
		process.off("SIGINT", sigintHandler);

		// Final render and cleanup
		this.cleanup();
		this.render();

		// Move past the rendered output
		process.stdout.write(`\x1B[${this.lastRenderedLines + 2}B`);

		// Print summary
		this.printSummary();
	}

	private printSummary() {
		const allTests = Array.from(this.results.values()).flatMap((r) => r.tests);
		const failedTests = allTests.filter((t) => t.status === "failed");
		const passedTests = allTests.filter((t) => t.status === "passed");
		const totalDuration = Array.from(this.results.values()).reduce(
			(sum, r) => sum + r.duration,
			0,
		);

		console.log("\n");

		if (failedTests.length === 0) {
			console.log(
				chalk.green.bold(
					`═${"═".repeat(68)}═\n` +
						`  ✓ ALL ${passedTests.length} TESTS PASSED (${(totalDuration / 1000).toFixed(1)}s)\n` +
						`═${"═".repeat(68)}═\n`,
				),
			);
			process.exit(0);
		}

		// Failed tests summary
		console.log(
			chalk.red.bold(
				`═${"═".repeat(68)}═\n` +
					`  FAILED TESTS (${failedTests.length})\n` +
					`═${"═".repeat(68)}═`,
			),
		);

		// Group failed tests by file
		const failedByFile = new Map<string, IndividualTest[]>();
		for (const [file, result] of this.results.entries()) {
			const fileFailed = result.tests.filter((t) => t.status === "failed");
			if (fileFailed.length > 0) {
				failedByFile.set(file, fileFailed);
			}
		}

		for (const [file, tests] of failedByFile) {
			console.log(chalk.red.bold(`\n📁 ${basename(file)}`));
			console.log(chalk.dim("─".repeat(60)));

			for (const test of tests) {
				console.log(chalk.red(`\n  ✗ ${test.name}`));

				if (test.error?.location) {
					console.log(chalk.cyan(`    ${test.error.location}`));
				}

				if (test.error?.message) {
					console.log(chalk.yellow(`\n    ${test.error.message}`));
				}

				if (test.error?.details) {
					// Show a few lines of error details
					const detailLines = test.error.details
						.split("\n")
						.filter((l) => l.trim())
						.slice(0, 8);
					for (const line of detailLines) {
						console.log(chalk.dim(`    ${this.truncate(line.trim(), 70)}`));
					}
				}
			}
		}

		console.log(
			chalk.red.bold(
				`\n═${"═".repeat(68)}═\n` +
					`  SUMMARY: ${chalk.green(`${passedTests.length} passed`)} | ${chalk.red(`${failedTests.length} failed`)} | ${(totalDuration / 1000).toFixed(1)}s\n` +
					`═${"═".repeat(68)}═\n`,
			),
		);

		process.exit(1);
	}
}

// Parse CLI arguments
const args = process.argv.slice(2);
const directories: string[] = [];
let maxParallel = 6;

for (const arg of args) {
	if (arg.startsWith("--max=")) {
		maxParallel = Number.parseInt(arg.split("=")[1], 10);
	} else if (arg.startsWith("-")) {
		console.error(chalk.red(`Unknown option: ${arg}`));
		console.log(
			"Usage: bun scripts/testScripts/runTestsV2.ts <dir1> [dir2] [...] [--max=N]",
		);
		process.exit(1);
	} else {
		// Try to resolve the path - if it doesn't exist, prepend the base path
		let resolvedPath = arg;
		const fullPath = resolve(process.cwd(), arg);

		if (!existsSync(fullPath)) {
			const withBase = `${INTEGRATION_TEST_BASE}/${arg}`;
			const withBaseFull = resolve(process.cwd(), withBase);
			if (existsSync(withBaseFull)) {
				resolvedPath = withBase;
			}
		}

		directories.push(resolvedPath);
	}
}

if (directories.length === 0) {
	console.error(chalk.red("Error: No test directories specified"));
	console.log(
		"Usage: bun scripts/testScripts/runTestsV2.ts <dir1> [dir2] [...] [--max=N]",
	);
	console.log("\nOptions:");
	console.log("  --max=N      Set maximum parallel test files (default: 6)");
	console.log("\nExamples:");
	console.log(
		"  bun scripts/testScripts/runTestsV2.ts update-subscription/custom-plan",
	);
	console.log(
		"  bun scripts/testScripts/runTestsV2.ts update-subscription/custom-plan update-subscription/errors --max=4",
	);
	process.exit(1);
}

// Run tests
const runner = new TestRunnerV2(maxParallel);
await runner.run(directories);
