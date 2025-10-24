#!/usr/bin/env bun

import { resolve } from "path";
import dotenv from "dotenv";

// Load environment variables from server/.env
dotenv.config({ path: resolve(import.meta.dir, "..", "..", ".env") });

import chalk from "chalk";
import { testGroups } from "./config.js";
import {
	type GroupProgress,
	type GroupResult,
	runTestGroupV2,
} from "./groupRunnerV2.js";

type TestFileStatus = "pending" | "running" | "passed" | "failed";

type TestFile = {
	name: string;
	status: TestFileStatus;
	duration?: number;
	error?: string;
};

type GroupStatus = "pending" | "setup" | "running" | "passed" | "failed";

type TestGroupState = {
	slug: string;
	status: GroupStatus;
	files: TestFile[];
	duration?: number;
	error?: string;
};

class SimpleTUI {
	private groups: TestGroupState[] = [];
	private startLine = 0;
	private renderInterval?: Timer;
	private spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
	private spinnerIndex = 0;
	private lastRenderedLineCount = 0;

	constructor(groups: TestGroupState[]) {
		this.groups = groups;
	}

	start() {
		// Hide cursor
		process.stdout.write("\x1B[?25l");

		// Reserve space for rendering
		const lines = this.calculateLines();
		for (let i = 0; i < lines; i++) {
			console.log();
		}
		// Move cursor back up
		process.stdout.write(`\x1B[${lines}A`);
		this.startLine = 1;

		// Start render loop
		this.renderInterval = setInterval(() => this.render(), 100);
	}

	updateGroup(slug: string, update: Partial<TestGroupState>) {
		const idx = this.groups.findIndex((g) => g.slug === slug);
		if (idx !== -1) {
			this.groups[idx] = { ...this.groups[idx], ...update };
		}
	}

	stop() {
		if (this.renderInterval) {
			clearInterval(this.renderInterval);
		}
		// Do one final render to show completed state
		this.render();
		// Show cursor
		process.stdout.write("\x1B[?25h");
		// Move past output using ACTUAL lines rendered, not max possible
		process.stdout.write(`\x1B[${this.lastRenderedLineCount}B`);
		console.log("\n");
	}

	private calculateLines(): number {
		// Fixed layout:
		// 2 lines for header
		// 7 lines per group (1 for group header, 6 for test files with stack traces)
		// 6 = 2 files * 3 lines each (file + error + stack)
		return 2 + (this.groups.length * 7);
	}

	private render() {
		this.spinnerIndex = (this.spinnerIndex + 1) % this.spinnerFrames.length;
		const spinner = this.spinnerFrames[this.spinnerIndex];

		let lineNum = this.startLine;

		// Move to start and clear line
		process.stdout.write(`\x1B[${lineNum};0H\x1B[2K`);
		// Header (no newline - we'll move cursor manually)
		process.stdout.write(chalk.bold.cyan("PARALLEL TEST RUNNER"));
		lineNum++;

		// Stats
		const completed = this.groups.filter(
			(g) => g.status === "passed" || g.status === "failed",
		).length;
		const passed = this.groups.filter((g) => g.status === "passed").length;
		const failed = this.groups.filter((g) => g.status === "failed").length;

		let totalTests = 0;
		let passedTests = 0;
		let failedTests = 0;
		for (const g of this.groups) {
			totalTests += g.files.length;
			passedTests += g.files.filter((f) => f.status === "passed").length;
			failedTests += g.files.filter((f) => f.status === "failed").length;
		}

		process.stdout.write(`\x1B[${lineNum};0H\x1B[2K`);
		process.stdout.write(
			`Groups: ${completed}/${this.groups.length} | ` +
				`${chalk.green(`✓ ${passed}`)} | ` +
				`${failed > 0 ? chalk.red(`✗ ${failed}`) : chalk.dim(`✗ ${failed}`)} | ` +
				`Tests: ${passedTests + failedTests}/${totalTests} | ` +
				`${chalk.green(`✓ ${passedTests}`)} | ` +
				`${failedTests > 0 ? chalk.red(`✗ ${failedTests}`) : chalk.dim(`✗ ${failedTests}`)}\n\n`,
		);
		lineNum += 2;

		// Groups
		for (const group of this.groups) {
			process.stdout.write(`\x1B[${lineNum};0H\x1B[2K`);

			let icon = "";
			let statusText = "";

			switch (group.status) {
				case "pending":
					icon = chalk.gray("…");
					statusText = "Pending";
					break;
				case "setup":
					icon = chalk.cyan(spinner);
					statusText = "Setting up";
					break;
				case "running":
					icon = chalk.cyan(spinner);
					statusText = "Running";
					break;
				case "passed":
					icon = chalk.green("✓");
					statusText = "Passed";
					break;
				case "failed":
					icon = chalk.red("✗");
					statusText = "Failed";
					break;
			}

			const completedCount =
				group.files.filter(
					(f) => f.status === "passed" || f.status === "failed",
				).length;
			const totalCount = group.files.length;
			const failedCount = group.files.filter((f) => f.status === "failed").length;

			let groupLine = `${icon} ${chalk.bold(group.slug)} - ${statusText}`;
			if (group.duration) {
				groupLine += chalk.dim(` (${(group.duration / 1000).toFixed(1)}s)`);
			}

			// Show progress for running/passed/failed groups
			if (group.status !== "pending" && totalCount > 0) {
				groupLine += chalk.dim(` | ${completedCount}/${totalCount} completed`);
				if (failedCount > 0) {
					groupLine += chalk.red(` [${failedCount} failed]`);
				}
			}

			process.stdout.write(groupLine);
			lineNum++;

			// Show failed files only
			if (group.status !== "pending" && failedCount > 0) {
				const failedFiles = group.files.filter((f) => f.status === "failed");
				for (const file of failedFiles.slice(0, 2)) {
					process.stdout.write(`\x1B[${lineNum};0H\x1B[2K`);
					let fileLine = `  ${chalk.red("✗")} ${file.name}`;
					if (file.error) {
						// Show first meaningful line of error (up to 80 chars)
						const errorLines = file.error.split("\n").filter((l) => l.trim());
						const shortError = errorLines[0]?.slice(0, 80) || "Test failed";
						fileLine += chalk.yellow(` → ${shortError}`);
					}
					process.stdout.write(fileLine);
					lineNum++;

					// Show stack trace location if available
					if (file.error) {
						const errorLines = file.error.split("\n");
						const stackLine = errorLines.find((l) =>
							l.trim().startsWith("at "),
						);
						if (stackLine) {
							// Extract file path and line number from stack trace
							// Format: "at functionName (/path/to/file.ts:123:45)"
							const match = stackLine.match(/\((.+?):(\d+):(\d+)\)/);
							if (match) {
								const [, filePath, line] = match;
								const fileName = filePath.split("/").pop();
								process.stdout.write(`\x1B[${lineNum};0H\x1B[2K`);
								process.stdout.write(chalk.dim(`      ${fileName}:${line}`));
								lineNum++;
							} else {
								// Clear the line if no stack found
								process.stdout.write(`\x1B[${lineNum};0H\x1B[2K`);
								lineNum++;
							}
						} else {
							// Clear the line if no stack found
							process.stdout.write(`\x1B[${lineNum};0H\x1B[2K`);
							lineNum++;
						}
					} else {
						// Clear the line if no error
						process.stdout.write(`\x1B[${lineNum};0H\x1B[2K`);
						lineNum++;
					}
				}
			} else {
				// Clear the file display lines (now 3 lines per file, 2 files max = 6 lines)
				for (let i = 0; i < 6; i++) {
					process.stdout.write(`\x1B[${lineNum};0H\x1B[2K`);
					lineNum++;
				}
			}
		}

		// Clear remaining lines
		const maxLines = this.calculateLines();
		while (lineNum < this.startLine + maxLines) {
			process.stdout.write(`\x1B[${lineNum};0H\x1B[2K`);
			lineNum++;
		}

		// Track how many lines we actually used (minus startLine offset)
		this.lastRenderedLineCount = lineNum - this.startLine;
	}
}

/**
 * Main entry point for parallel test execution with TUI
 */
async function main() {
	// Validate environment
	if (!process.env.TEST_ORG_SECRET_KEY) {
		console.error(
			chalk.red.bold(
				"ERROR: TEST_ORG_SECRET_KEY environment variable is required",
			),
		);
		console.log(
			chalk.dim(
				"\nThis should be the secret key of your platform organization that has access to create/delete orgs.",
			),
		);
		process.exit(1);
	}

	// Parse CLI arguments for targeted group execution
	const args = process.argv.slice(2);
	const targetedSlugs = args.filter((arg) => !arg.startsWith("--"));
	const forceSetup = args.includes("--setup");

	// Filter test groups based on CLI args
	let groupsToRun = testGroups;
	// When targeting specific groups, skip setup by default unless --setup is passed
	const skipSetup = targetedSlugs.length > 0 && !forceSetup;

	if (targetedSlugs.length > 0) {
		groupsToRun = testGroups.filter((g) => targetedSlugs.includes(g.slug));
		if (groupsToRun.length === 0) {
			console.error(
				chalk.red.bold(
					`\nERROR: No matching test groups found for: ${targetedSlugs.join(", ")}`,
				),
			);
			console.log(chalk.dim("\nAvailable groups:"));
			for (const group of testGroups) {
				console.log(chalk.dim(`  - ${group.slug}`));
			}
			process.exit(1);
		}
		console.log(
			chalk.cyan(
				`\nRunning targeted groups: ${groupsToRun.map((g) => g.slug).join(", ")}`,
			),
		);
		if (skipSetup) {
			console.log(
				chalk.yellow(
					"Skipping org setup (using existing test orgs). Use --setup to force recreate.\n",
				),
			);
		} else {
			console.log(chalk.yellow("Recreating test orgs from scratch...\n"));
		}
	}

	const startTime = performance.now();

	// Initialize UI state
	const initialGroups: TestGroupState[] = groupsToRun.map((group) => ({
		slug: group.slug,
		status: "pending",
		files: [],
		duration: undefined,
		error: undefined,
	}));

	const tui = new SimpleTUI(initialGroups);
	tui.start();

	// Run all groups in parallel with progress updates
	const results = await Promise.all(
		groupsToRun.map((group) =>
			runTestGroupV2({
				group,
				skipSetup,
				onProgress: (progress: GroupProgress) => {
					tui.updateGroup(group.slug, {
						status: progress.status,
						files: progress.files.map((f) => ({
							name: f.name,
							status: f.status,
							duration: f.duration,
							error: f.error,
							output: f.output,
						})),
						duration: progress.duration,
						error: progress.error,
					});
				},
			}),
		),
	);

	const totalDuration = performance.now() - startTime;

	// Stop TUI
	tui.stop();

	// Calculate totals
	const successfulGroups = results.filter((r) => r.success);
	const failedGroups = results.filter((r) => !r.success);

	let totalTests = 0;
	let totalPassed = 0;
	let totalFailed = 0;

	for (const result of results) {
		totalTests += result.files.length;
		totalPassed += result.files.filter((f) => f.status === "passed").length;
		totalFailed += result.files.filter((f) => f.status === "failed").length;
	}

	// Print summary
	console.log(
		chalk.bold.cyan(
			"\n╔═══════════════════════════════════════════════════════════════════╗",
		),
	);
	console.log(
		chalk.bold.cyan(
			"║                           SUMMARY                                 ║",
		),
	);
	console.log(
		chalk.bold.cyan(
			"╚═══════════════════════════════════════════════════════════════════╝\n",
		),
	);

	console.log(
		chalk.bold(
			`  Total Duration:  ${chalk.cyan((totalDuration / 1000).toFixed(2))}s`,
		),
	);
	console.log(
		chalk.bold(
			`  Test Groups:     ${chalk.green(successfulGroups.length)} passed, ${failedGroups.length > 0 ? chalk.red(failedGroups.length) : chalk.dim(failedGroups.length)} failed`,
		),
	);
	console.log(
		chalk.bold(
			`  Tests:           ${chalk.green(totalPassed)} passed, ${totalFailed > 0 ? chalk.red(totalFailed) : chalk.dim(totalFailed)} failed (${totalTests} total)`,
		),
	);

	// Show details for failed groups
	if (failedGroups.length > 0) {
		console.log(
			chalk.red.bold(
				"\n╔═══════════════════════════════════════════════════════════════════╗",
			),
		);
		console.log(
			chalk.red.bold(
				"║                         FAILED TESTS                              ║",
			),
		);
		console.log(
			chalk.red.bold(
				"╚═══════════════════════════════════════════════════════════════════╝",
			),
		);

		for (const result of failedGroups) {
			console.log(chalk.red.bold(`\n  ✗ ${result.group.slug}`));
			console.log(
				chalk.dim(`    Duration: ${(result.duration / 1000).toFixed(2)}s`),
			);

			const failedFiles = result.files.filter((f) => f.status === "failed");

			if (failedFiles.length > 0) {
				console.log(
					chalk.dim(
						`    Failed: ${failedFiles.length}/${result.files.length} tests\n`,
					),
				);

				for (const file of failedFiles) {
					console.log(chalk.red(`    ┌─ ${file.name}`));
					if (file.error) {
						// Show all error lines with proper indentation
						const errorLines = file.error.split("\n");
						for (const line of errorLines) {
							if (line.trim()) {
								console.log(chalk.yellow(`    │  ${line}`));
							}
						}
					}

					// Show full test output if available
					if (file.output) {
						console.log(chalk.red("    │"));
						console.log(chalk.cyan("    │  === Full Test Output ==="));
						const outputLines = file.output.split("\n");
						for (const line of outputLines) {
							if (line.trim()) {
								console.log(chalk.dim(`    │  ${line}`));
							}
						}
					}
					console.log(chalk.red("    └─\n"));
				}
			} else if (result.error) {
				console.log(chalk.dim(`    ${result.error}\n`));
			}
		}

		console.log(
			chalk.red.bold(
				"╔═══════════════════════════════════════════════════════════════════╗",
			),
		);
		console.log(
			chalk.red.bold(
				`║  ${failedGroups.length} GROUP(S) FAILED                                               ║`,
			),
		);
		console.log(
			chalk.red.bold(
				"╚═══════════════════════════════════════════════════════════════════╝\n",
			),
		);
		process.exit(1);
	}

	console.log(
		chalk.green.bold(
			"\n╔═══════════════════════════════════════════════════════════════════╗",
		),
	);
	console.log(
		chalk.green.bold(
			"║                    ✓ ALL TESTS PASSED                             ║",
		),
	);
	console.log(
		chalk.green.bold(
			"╚═══════════════════════════════════════════════════════════════════╝\n",
		),
	);
	process.exit(0);
}

main().catch((error) => {
	console.error(chalk.red.bold("\nFatal error:"), error);
	process.exit(1);
});
