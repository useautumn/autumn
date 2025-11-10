#!/usr/bin/env bun

import { spawn } from "bun";
import chalk from "chalk";
import dotenv from "dotenv";
import { readdir } from "fs/promises";
import pLimit from "p-limit";
import { basename, resolve } from "path";

// Load environment variables from server/.env
dotenv.config({ path: resolve(process.cwd(), "server", ".env") });

interface TestResult {
	file: string;
	status: "pending" | "running" | "passed" | "failed";
	output: string;
	duration: number;
	error?: string;
	lastTestName?: string;
}

class TestRunner {
	private results: Map<string, TestResult> = new Map();
	private testFiles: string[] = [];
	private maxParallel: number = 6;
	private spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
	private spinnerIndex = 0;
	private renderInterval?: Timer;
	private startLine = 0;
	private compactMode: boolean = false;
	private lastRenderedLines = 0;

	constructor(maxParallel?: number, compactMode?: boolean) {
		if (maxParallel) this.maxParallel = maxParallel;
		if (compactMode) this.compactMode = compactMode;
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

	private extractLastTest(output: string): string | null {
		const lines = output.split("\n");

		for (let i = lines.length - 1; i >= 0; i--) {
			const line = lines[i].trim();

			const testMatch = line.match(/^[✓✗]\s+(.+?)(?:\s+\[\d+\.\d+m?s\])?$/);
			if (testMatch) {
				return testMatch[1];
			}

			const bunTestMatch = line.match(/test\s+"([^"]+)"/);
			if (bunTestMatch) {
				return bunTestMatch[1];
			}
		}

		return null;
	}

	private truncateTestName(name: string, maxLength: number = 50): string {
		if (name.length <= maxLength) return name;
		return name.substring(0, maxLength - 3) + "...";
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

	private getSpacesNeeded(): number {
		if (!this.compactMode) {
			return this.testFiles.length + 3;
		}

		// Compact mode: dynamically calculate based on content
		// Base: 10 lines for headers, stats, spacing
		// + 3 lines for recently completed
		// + failed tests * 4 (name + 2 error lines + spacing)
		// + running tests
		const failedCount = Array.from(this.results.values()).filter(
			(r) => r.status === "failed",
		).length;
		const runningCount = Array.from(this.results.values()).filter(
			(r) => r.status === "running",
		).length;

		return Math.min(
			10 + 3 + failedCount * 4 + Math.min(runningCount, 6),
			30, // Cap at 30 lines
		);
	}

	private render() {
		this.spinnerIndex = (this.spinnerIndex + 1) % this.spinnerFrames.length;
		const spinner = this.spinnerFrames[this.spinnerIndex];

		if (this.compactMode) {
			// Compact mode: show completed, failed, running tests, then stats
			let lineNum = this.startLine;

			const completed = Array.from(this.results.values()).filter(
				(r) => r.status === "passed" || r.status === "failed",
			).length;
			const passed = Array.from(this.results.values()).filter(
				(r) => r.status === "passed",
			).length;
			const failed = Array.from(this.results.values()).filter(
				(r) => r.status === "failed",
			).length;

			// Show recently completed tests (last 3)
			const passedTests = Array.from(this.results.entries())
				.filter(([_, result]) => result.status === "passed")
				.slice(-3); // Get last 3 completed

			if (passedTests.length > 0) {
				this.moveCursor(lineNum, 0);
				this.clearLine();
				process.stdout.write(
					chalk.green.bold(`Recently Completed (${passed} total):\n`),
				);
				lineNum++;

				for (const [file] of passedTests) {
					this.moveCursor(lineNum, 0);
					this.clearLine();
					const testName = basename(file);
					process.stdout.write(
						`  ${chalk.green("✓")} ${chalk.dim(testName)}\n`,
					);
					lineNum++;
				}

				// Add blank line
				this.moveCursor(lineNum, 0);
				this.clearLine();
				process.stdout.write("\n");
				lineNum++;
			}

			// Show failed tests
			const failedTests = Array.from(this.results.entries()).filter(
				([_, result]) => result.status === "failed",
			);

			if (failedTests.length > 0) {
				this.moveCursor(lineNum, 0);
				this.clearLine();
				process.stdout.write(
					chalk.red.bold(`Failed (${failedTests.length}):\n`),
				);
				lineNum++;

				for (const [file, result] of failedTests) {
					this.moveCursor(lineNum, 0);
					this.clearLine();
					const testName = basename(file);
					process.stdout.write(`  ${chalk.red("✗")} ${testName}\n`);
					lineNum++;

					// Show first 2 lines of error
					if (result.error) {
						const errorLines = result.error.split("\n").filter((l) => l.trim());
						const displayLines = errorLines.slice(0, 2);
						for (const line of displayLines) {
							this.moveCursor(lineNum, 0);
							this.clearLine();
							const truncated =
								line.length > 80 ? line.substring(0, 77) + "..." : line;
							process.stdout.write(`    ${chalk.dim(truncated)}\n`);
							lineNum++;
						}
					}
				}

				// Add blank line after failed tests
				this.moveCursor(lineNum, 0);
				this.clearLine();
				process.stdout.write("\n");
				lineNum++;
			}

			// Show currently running tests
			const runningTests = Array.from(this.results.entries()).filter(
				([_, result]) => result.status === "running",
			);

			if (runningTests.length > 0) {
				this.moveCursor(lineNum, 0);
				this.clearLine();
				process.stdout.write(
					chalk.cyan.bold(`Running (${runningTests.length}):\n`),
				);
				lineNum++;

				for (const [file, result] of runningTests) {
					this.moveCursor(lineNum, 0);
					this.clearLine();
					const testName = basename(file);
					let displayText = `  ${chalk.cyan(spinner)} ${testName}`;
					if (result.lastTestName) {
						const truncated = this.truncateTestName(result.lastTestName, 40);
						displayText += chalk.dim(` › ${truncated}`);
					}
					process.stdout.write(`${displayText}\n`);
					lineNum++;
				}

				// Add blank line after running tests
				this.moveCursor(lineNum, 0);
				this.clearLine();
				process.stdout.write("\n");
				lineNum++;
			}

			// Show stats line
			this.moveCursor(lineNum, 0);
			this.clearLine();
			process.stdout.write(
				`${chalk.cyan(spinner)} Progress: ${chalk.bold(`${completed}/${this.testFiles.length}`)} | ` +
					`${chalk.green(`✓ ${passed}`)} | ` +
					`${failed > 0 ? chalk.red(`✗ ${failed}`) : chalk.dim(`✗ ${failed}`)}\n`,
			);
			lineNum++;

			// Clear any remaining lines from previous renders
			const maxLines = this.getSpacesNeeded();
			while (lineNum < maxLines) {
				this.moveCursor(lineNum, 0);
				this.clearLine();
				lineNum++;
			}

			// Track how many lines we actually used
			this.lastRenderedLines = lineNum - this.startLine;
		} else {
			// Full mode: show all tests
			let lineNum = this.startLine;

			for (const file of this.testFiles) {
				const result = this.results.get(file);
				if (!result) continue;

				this.moveCursor(lineNum, 0);
				this.clearLine();

				const testName = basename(file);
				let statusIcon: string;
				let displayText: string;

				switch (result.status) {
					case "pending":
						statusIcon = chalk.dim("⋯");
						displayText = chalk.dim(testName);
						break;
					case "running":
						statusIcon = chalk.cyan(spinner);
						displayText = testName;
						if (result.lastTestName) {
							const truncated = this.truncateTestName(result.lastTestName);
							displayText += chalk.dim(` › ${truncated}`);
						}
						break;
					case "passed":
						statusIcon = chalk.green("✓");
						displayText = chalk.dim(testName);
						break;
					case "failed":
						statusIcon = chalk.red("✗");
						displayText = testName;
						break;
				}

				process.stdout.write(`${statusIcon} ${displayText}\n`);
				lineNum++;
			}

			// Summary line
			const completed = Array.from(this.results.values()).filter(
				(r) => r.status === "passed" || r.status === "failed",
			).length;
			const failed = Array.from(this.results.values()).filter(
				(r) => r.status === "failed",
			).length;
			const running = Array.from(this.results.values()).filter(
				(r) => r.status === "running",
			).length;

			this.moveCursor(lineNum + 1, 0);
			this.clearLine();
			if (running > 0) {
				process.stdout.write(
					chalk.dim(
						`Running: ${running} | Completed: ${completed}/${this.testFiles.length} | Failed: ${failed}`,
					),
				);
			}

			// Track how many lines we actually used
			this.lastRenderedLines = lineNum + 2 - this.startLine;
		}
	}

	async runTest(file: string): Promise<void> {
		const startTime = performance.now();

		// Initialize as running
		const result: TestResult = {
			file,
			status: "running",
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

					// Update last test name
					const lastTest = this.extractLastTest(output);
					if (lastTest) {
						result.lastTestName = lastTest;
						result.output = output;
						this.results.set(file, result);
					}
				}
			}

			if (proc.stderr) {
				for await (const chunk of proc.stderr) {
					output += decoder.decode(chunk);
				}
			}

			await proc.exited;
			const duration = performance.now() - startTime;

			if (proc.exitCode === 0) {
				this.results.set(file, {
					...result,
					status: "passed",
					output,
					duration,
				});
			} else {
				this.results.set(file, {
					...result,
					status: "failed",
					output,
					duration,
					error: this.extractError(output),
				});
			}
		} catch (error) {
			const duration = performance.now() - startTime;
			this.results.set(file, {
				...result,
				status: "failed",
				output: "",
				duration,
				error: String(error),
			});
		}
	}

	private extractError(output: string): string {
		const lines = output.split("\n");
		const errorLines: string[] = [];
		let inError = false;
		let capturedLines = 0;

		for (const line of lines) {
			if (
				line.includes("error:") ||
				line.includes("Error:") ||
				line.includes("Expected:") ||
				line.includes("Received:") ||
				line.includes("AssertionError")
			) {
				inError = true;
			}

			if (inError) {
				errorLines.push(line);
				capturedLines++;

				if (capturedLines > 20) break;
			}

			if (line.match(/^[\s]*✗/)) {
				errorLines.push(line);
			}
		}

		return errorLines.length > 0 ? errorLines.join("\n").trim() : output;
	}

	private cleanup() {
		if (this.renderInterval) {
			clearInterval(this.renderInterval);
		}
		this.showCursor();
	}

	private handleInterrupt() {
		this.cleanup();

		// Move cursor past all output (use actual rendered lines in compact mode)
		const linesToMove = this.compactMode
			? this.lastRenderedLines
			: this.getSpacesNeeded();
		process.stdout.write(`\x1B[${linesToMove}B`);
		console.log("\n");

		console.log(chalk.yellow.bold("\n⚠ Tests interrupted by user (Ctrl+C)\n"));

		// Print summary of what we have so far
		const failedTests = Array.from(this.results.values()).filter(
			(t) => t.status === "failed",
		);
		const completedTests = Array.from(this.results.values()).filter(
			(t) => t.status === "passed" || t.status === "failed",
		);

		console.log(
			chalk.dim(
				`Completed: ${completedTests.length}/${this.testFiles.length} tests before interruption`,
			),
		);

		if (failedTests.length > 0) {
			console.log(
				chalk.red.bold(
					`\n${"═".repeat(70)}\n  FAILED TESTS (${failedTests.length})\n${"═".repeat(70)}\n`,
				),
			);

			for (const test of failedTests) {
				const testName = basename(test.file);
				console.log(chalk.red.bold(`\n✗ ${testName}`));
				console.log(chalk.dim("─".repeat(70)));

				if (test.error) {
					const errorLines = test.error.split("\n");
					for (const line of errorLines) {
						if (line.trim()) {
							if (line.includes("Expected:") || line.includes("Received:")) {
								console.log(chalk.yellow(line));
							} else if (line.includes("✗")) {
								console.log(chalk.red(line));
							} else {
								console.log(chalk.dim(line));
							}
						}
					}
				}
			}

			console.log(
				chalk.red.bold(
					`\n${"═".repeat(70)}\n  ${failedTests.length} test file(s) failed\n${"═".repeat(70)}\n`,
				),
			);
		}

		process.exit(130); // Standard exit code for SIGINT
	}

	async run(directories: string[]): Promise<void> {
		this.testFiles = await this.collectTestFiles(directories);

		if (this.testFiles.length === 0) {
			console.log(chalk.yellow("No test files found in specified directories"));
			return;
		}

		console.log(
			chalk.bold(`\nRunning ${this.testFiles.length} test file(s)...\n`),
		);

		// Initialize all tests as pending
		for (const file of this.testFiles) {
			this.results.set(file, {
				file,
				status: "pending",
				output: "",
				duration: 0,
			});
		}

		// Setup SIGINT handler
		const sigintHandler = () => this.handleInterrupt();
		process.on("SIGINT", sigintHandler);

		// Hide cursor and create space for all tests
		this.hideCursor();
		this.startLine = 1; // Start from line 1

		// Create space - less space needed in compact mode
		const spacesNeeded = this.getSpacesNeeded();
		this.lastRenderedLines = spacesNeeded; // Initialize to full space
		for (let i = 0; i < spacesNeeded; i++) {
			console.log();
		}

		// Move cursor back up to start rendering
		process.stdout.write(`\x1B[${spacesNeeded}A`);

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

		// Final render
		this.cleanup();
		this.render();

		// Move cursor past all output (use actual rendered lines in compact mode)
		const linesToMove = this.compactMode
			? this.lastRenderedLines
			: this.getSpacesNeeded();
		process.stdout.write(`\x1B[${linesToMove}B`);
		console.log("\n");

		// Print summary
		this.printSummary();
	}

	private printSummary() {
		const failedTests = Array.from(this.results.values()).filter(
			(t) => t.status === "failed",
		);

		if (failedTests.length === 0) {
			console.log(
				chalk.green.bold(`✓ All ${this.testFiles.length} test file(s) passed!`),
			);
			process.exit(0);
		}

		console.log(
			chalk.red.bold(
				`\n${"═".repeat(70)}\n  FAILED TESTS (${failedTests.length}/${this.testFiles.length})\n${"═".repeat(70)}\n`,
			),
		);

		for (const test of failedTests) {
			const testName = basename(test.file);
			console.log(chalk.red.bold(`\n✗ ${testName}`));
			console.log(chalk.dim("─".repeat(70)));

			if (test.error) {
				const errorLines = test.error.split("\n");
				for (const line of errorLines) {
					if (line.trim()) {
						if (line.includes("Expected:") || line.includes("Received:")) {
							console.log(chalk.yellow(line));
						} else if (line.includes("✗")) {
							console.log(chalk.red(line));
						} else {
							console.log(chalk.dim(line));
						}
					}
				}
			}
		}

		console.log(
			chalk.red.bold(
				`\n${"═".repeat(70)}\n  ${failedTests.length} test file(s) failed\n${"═".repeat(70)}\n`,
			),
		);
		process.exit(1);
	}
}

// Parse CLI arguments
const args = process.argv.slice(2);
const directories: string[] = [];
let maxParallel = 6;
let compactMode = false;

for (const arg of args) {
	if (arg.startsWith("--max=")) {
		maxParallel = Number.parseInt(arg.split("=")[1], 10);
	} else if (arg === "--compact") {
		compactMode = true;
	} else if (arg.startsWith("-")) {
		console.error(chalk.red(`Unknown option: ${arg}`));
		console.log(
			"Usage: bun scripts/testScripts/runTests.ts <dir1> [dir2] [...] [--max=N] [--compact]",
		);
		process.exit(1);
	} else {
		directories.push(arg);
	}
}

if (directories.length === 0) {
	console.error(chalk.red("Error: No test directories specified"));
	console.log(
		"Usage: bun scripts/testScripts/runTests.ts <dir1> [dir2] [...] [--max=N] [--compact]",
	);
	console.log("\nOptions:");
	console.log("  --max=N      Set maximum parallel test files (default: 6)");
	console.log(
		"  --compact    Use compact mode (only show summary and failures)",
	);
	console.log("\nExamples:");
	console.log(
		"  bun scripts/testScripts/runTests.ts server/tests/attach/upgrade",
	);
	console.log(
		"  bun scripts/testScripts/runTests.ts server/tests/attach/upgrade server/tests/attach/downgrade",
	);
	console.log(
		"  bun scripts/testScripts/runTests.ts server/tests/attach/upgrade --max=10",
	);
	console.log(
		"  bun scripts/testScripts/runTests.ts server/tests/attach/upgrade --compact",
	);
	process.exit(1);
}

// Run tests
const runner = new TestRunner(maxParallel, compactMode);
await runner.run(directories);
