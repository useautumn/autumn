#!/usr/bin/env bun

import { resolve } from "path";
import dotenv from "dotenv";

// Load environment variables from server/.env
dotenv.config({ path: resolve(import.meta.dir, "..", "..", ".env") });

import chalk from "chalk";
import { testGroups } from "./config.js";
import { type GroupResult, runTestGroup } from "./groupRunner.js";

/**
 * Main entry point for parallel test execution
 * Runs all test groups in parallel, each with its own dedicated org
 */
async function main() {
	// Check for flags
	const verbose = process.argv.includes("--verbose");
	const debug = process.argv.includes("--debug");

	console.log(chalk.bold.cyan("\n╔═══════════════════════════════════════════════════════════════════╗"));
	console.log(chalk.bold.cyan("║                   PARALLEL TEST RUNNER                            ║"));
	console.log(chalk.bold.cyan("╚═══════════════════════════════════════════════════════════════════╝\n"));

	console.log(chalk.dim(`Running ${testGroups.length} test group(s) in parallel...\n`));

	if (!verbose && !debug) {
		console.log(chalk.dim("  💡 Use --verbose to see all output, --debug for single test debugging\n"));
	}

	// Validate environment
	if (!process.env.TEST_ORG_SECRET_KEY) {
		console.error(chalk.red.bold("ERROR: TEST_ORG_SECRET_KEY environment variable is required"));
		console.log(
			chalk.dim(
				"\nThis should be the secret key of your platform organization that has access to create/delete orgs.",
			),
		);
		process.exit(1);
	}

	const startTime = performance.now();

	// Run all groups in parallel
	const results = await Promise.all(
		testGroups.map((group) => runTestGroup({ group, verbose, debug })),
	);

	const totalDuration = performance.now() - startTime;

	// Calculate totals
	const successfulGroups = results.filter((r) => r.success);
	const failedGroups = results.filter((r) => !r.success);

	let totalTests = 0;
	let totalPassed = 0;
	let totalFailed = 0;

	for (const result of results) {
		if (result.testSummary) {
			totalTests += result.testSummary.totalTests;
			totalPassed += result.testSummary.passedTests;
			totalFailed += result.testSummary.failedTests;
		}
	}

	// Print summary
	console.log(chalk.bold.cyan("\n╔═══════════════════════════════════════════════════════════════════╗"));
	console.log(chalk.bold.cyan("║                           SUMMARY                                 ║"));
	console.log(chalk.bold.cyan("╚═══════════════════════════════════════════════════════════════════╝\n"));

	console.log(chalk.bold(`  Total Duration:  ${chalk.cyan((totalDuration / 1000).toFixed(2))}s`));
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
		console.log(chalk.red.bold("\n╔═══════════════════════════════════════════════════════════════════╗"));
		console.log(chalk.red.bold("║                         FAILED TESTS                              ║"));
		console.log(chalk.red.bold("╚═══════════════════════════════════════════════════════════════════╝"));

		for (const result of failedGroups) {
			console.log(chalk.red.bold(`\n  ✗ ${result.group.slug}`));
			console.log(chalk.dim(`    Duration: ${(result.duration / 1000).toFixed(2)}s`));

			if (result.testSummary && result.testSummary.failures.length > 0) {
				console.log(chalk.dim(`    Failed: ${result.testSummary.failedTests}/${result.testSummary.totalTests} tests\n`));

				for (const failure of result.testSummary.failures) {
					console.log(chalk.red(`    ┌─ ${failure.testFile || "unknown test"}`));
					console.log(chalk.red(`    │  ${failure.testName}`));
					console.log(chalk.red(`    │`));
					console.log(chalk.yellow(`    │  ${failure.errorMessage}`));
					if (failure.errorLocation) {
						console.log(chalk.dim(`    │  ${failure.errorLocation}`));
					}
					console.log(chalk.red(`    └─\n`));
				}
			} else {
				console.log(chalk.dim(`    ${result.error}\n`));
			}
		}

		console.log(chalk.red.bold("╔═══════════════════════════════════════════════════════════════════╗"));
		console.log(chalk.red.bold(`║  ${failedGroups.length} GROUP(S) FAILED                                               ║`));
		console.log(chalk.red.bold("╚═══════════════════════════════════════════════════════════════════╝\n"));
		process.exit(1);
	}

	console.log(chalk.green.bold("\n╔═══════════════════════════════════════════════════════════════════╗"));
	console.log(chalk.green.bold("║                    ✓ ALL TESTS PASSED                             ║"));
	console.log(chalk.green.bold("╚═══════════════════════════════════════════════════════════════════╝\n"));
	process.exit(0);
}

main().catch((error) => {
	console.error(chalk.red.bold("\nFatal error:"), error);
	process.exit(1);
});
