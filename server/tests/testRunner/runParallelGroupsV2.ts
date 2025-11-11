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
import {
	type TestGroupState,
	createTestRunnerUI,
} from "./TestRunnerUI.js";

/**
 * Main entry point for parallel test execution with TUI
 */
async function main() {
	// Check for flags
	const verbose = process.argv.includes("--verbose");
	const debug = process.argv.includes("--debug");

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

	const startTime = performance.now();

	// Initialize UI state
	const initialGroups: TestGroupState[] = testGroups.map((group) => ({
		slug: group.slug,
		status: "pending",
		files: [],
		duration: undefined,
		error: undefined,
	}));

	const { updateGroup, cleanup } = createTestRunnerUI(initialGroups);

	// Run all groups in parallel with progress updates
	const results = await Promise.all(
		testGroups.map((group) =>
			runTestGroupV2({
				group,
				onProgress: (progress: GroupProgress) => {
					updateGroup(group.slug, {
						status: progress.status,
						files: progress.files.map((f) => ({
							name: f.name,
							status: f.status,
							duration: f.duration,
							error: f.error,
						})),
						duration: progress.duration,
						error: progress.error,
					});
				},
			}),
		),
	);

	const totalDuration = performance.now() - startTime;

	// Cleanup UI
	cleanup();

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
						// Show first line of error
						const errorLine = file.error.split("\n")[0];
						console.log(chalk.yellow(`    │  ${errorLine.slice(0, 80)}`));
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
