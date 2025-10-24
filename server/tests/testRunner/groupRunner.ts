#!/usr/bin/env bun

import { spawn } from "bun";
import chalk from "chalk";
import dotenv from "dotenv";
import { resolve } from "path";

// Load environment variables from server/.env
dotenv.config({ path: resolve(import.meta.dir, "..", "..", ".env") });

import type { TestGroup } from "./config.js";
import { type TestSummary, parseTestOutput } from "./outputParser.js";

export type GroupResult = {
	group: TestGroup;
	success: boolean;
	output: string;
	error?: string;
	duration: number;
	testSummary?: TestSummary;
};

/**
 * Calls the platform API to delete an org by slug
 */
async function deleteOrg({ slug }: { slug: string }): Promise<void> {
	const secretKey = process.env.TEST_ORG_SECRET_KEY;
	if (!secretKey) {
		throw new Error("TEST_ORG_SECRET_KEY not found in environment");
	}

	const baseUrl = process.env.BASE_URL || "http://localhost:8080";
	const response = await fetch(`${baseUrl}/v1/platform/beta/organizations`, {
		method: "DELETE",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${secretKey}`,
		},
		body: JSON.stringify({ slug }),
	});

	if (!response.ok) {
		const error = await response.text();
		// If org doesn't exist (404), that's fine - we just wanted it deleted anyway
		if (response.status === 404) {
			console.log(chalk.dim(`Org ${slug} doesn't exist (already deleted)`));
			return;
		}
		throw new Error(
			`Failed to delete org ${slug}: ${response.status} ${error}`,
		);
	}

	const data = await response.json();
	console.log(chalk.green(`✓ Deleted org: ${slug}`));
}

/**
 * Calls the platform API to create a new org
 */
async function createOrg({
	slug,
	name,
	userEmail,
}: {
	slug: string;
	name: string;
	userEmail: string;
}): Promise<{ secretKey: string; fullSlug: string }> {
	const secretKey = process.env.TEST_ORG_SECRET_KEY;
	if (!secretKey) {
		throw new Error("TEST_ORG_SECRET_KEY not found in environment");
	}

	const baseUrl = process.env.BASE_URL || "http://localhost:8080";
	const response = await fetch(`${baseUrl}/v1/platform/beta/organizations`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${secretKey}`,
		},
		body: JSON.stringify({
			user_email: userEmail,
			name,
			slug,
			env: "test",
		}),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(
			`Failed to create org ${slug}: ${response.status} ${error}`,
		);
	}

	const data = await response.json();
	if (!data.test_secret_key) {
		throw new Error(`No test_secret_key returned for org ${slug}`);
	}
	if (!data.org_slug) {
		throw new Error(`No org_slug returned for org ${slug}`);
	}

	console.log(chalk.green(`✓ Created org: ${slug}`));

	// Wait a moment for API key cache to propagate
	await new Promise((resolve) => setTimeout(resolve, 1000));

	return {
		secretKey: data.test_secret_key,
		fullSlug: data.org_slug,
	};
}

/**
 * Runs tests for a single group
 */
export async function runTestGroup({
	group,
	verbose = false,
	debug = false,
}: {
	group: TestGroup;
	verbose?: boolean;
	debug?: boolean;
}): Promise<GroupResult> {
	const startTime = performance.now();
	let output = "";

	// Auto-enable debug mode for small test runs (1-3 files)
	const totalTestCount = group.paths.length;
	const shouldDebug = debug || (totalTestCount <= 3 && totalTestCount > 0);

	try {
		if (!shouldDebug) {
			console.log(chalk.cyan(`\n┌─ ${chalk.bold(group.slug)}`));
			console.log(chalk.cyan("│"));
			console.log(chalk.cyan(`│ ${chalk.dim("Preparing test environment...")}`));
		} else {
			console.log(chalk.cyan.bold(`\n[${group.slug}] Starting test group`));
		}

		// 1. Delete existing org (cleanup from previous runs)
		if (shouldDebug) {
			console.log(chalk.dim(`[${group.slug}] Deleting existing org...`));
		}
		try {
			await deleteOrg({ slug: group.slug });
		} catch (error: any) {
			if (shouldDebug) {
				console.log(
					chalk.yellow(
						`[${group.slug}] Warning: Failed to delete org - ${error.message}`,
					),
				);
			}
		}

		// 2. Create new org and get secret key
		if (shouldDebug) {
			console.log(chalk.dim(`[${group.slug}] Creating new org...`));
		}
		const { secretKey, fullSlug } = await createOrg({
			slug: group.slug,
			name: `Test Group: ${group.slug}`,
			userEmail: `test@gmail.com`,
		});

		// 3. Run setup for the org (seed test data)
		if (shouldDebug) {
			console.log(chalk.dim(`[${group.slug}] Setting up test data...`));
		}

		const serverDir = resolve(import.meta.dir, "..", "..");
		const setupPath = resolve(serverDir, "tests/setupMain.ts");

		const setupProc = spawn(["bun", setupPath], {
			stdout: "pipe",
			stderr: "pipe",
			cwd: serverDir,
			env: {
				...process.env,
				UNIT_TEST_AUTUMN_SECRET_KEY: secretKey,
				TESTS_ORG: fullSlug,
			},
		});

		// Collect setup output (stream only if verbose or debug)
		let setupOutput = "";
		const setupDecoder = new TextDecoder();
		if (setupProc.stdout) {
			for await (const chunk of setupProc.stdout) {
				const text = setupDecoder.decode(chunk);
				setupOutput += text;
				if (verbose || shouldDebug) {
					process.stdout.write(text);
				}
			}
		}
		if (setupProc.stderr) {
			for await (const chunk of setupProc.stderr) {
				const text = setupDecoder.decode(chunk);
				setupOutput += text;
				if (verbose || shouldDebug) {
					process.stderr.write(text);
				}
			}
		}

		await setupProc.exited;
		if (setupProc.exitCode !== 0) {
			throw new Error(
				`Setup failed for ${group.slug}: ${setupOutput.slice(0, 2000)}`,
			);
		}

		// 4. Run tests with the secret key
		if (!shouldDebug) {
			console.log(chalk.cyan(`│ ${chalk.dim("Running tests...")}`));
		} else {
			console.log(chalk.dim(`[${group.slug}] Running tests...`));
		}

		const runTestsPath = resolve(import.meta.dir, "runTests.ts");

		const proc = spawn(["bun", runTestsPath, ...group.paths], {
			stdout: "pipe",
			stderr: "pipe",
			cwd: serverDir,
			env: {
				...process.env,
				UNIT_TEST_AUTUMN_SECRET_KEY: secretKey,
				TESTS_ORG: fullSlug, // Use the full slug with master org ID suffix
			},
		});

		const decoder = new TextDecoder();

		if (proc.stdout) {
			for await (const chunk of proc.stdout) {
				const text = decoder.decode(chunk);
				output += text;
				if (verbose || shouldDebug) {
					process.stdout.write(text);
				}
			}
		}

		if (proc.stderr) {
			for await (const chunk of proc.stderr) {
				const text = decoder.decode(chunk);
				output += text;
				if (verbose || shouldDebug) {
					process.stderr.write(text);
				}
			}
		}

		await proc.exited;
		const duration = performance.now() - startTime;

		// Parse test output for summary
		const testSummary = parseTestOutput(output);

		if (proc.exitCode === 0) {
			if (!shouldDebug) {
				console.log(chalk.cyan("│"));
				console.log(
					chalk.cyan(
						`└─ ${chalk.green.bold("✓ All tests passed")} ${chalk.dim(`(${(duration / 1000).toFixed(2)}s)`)}`,
					),
				);
			} else {
				console.log(
					chalk.green.bold(
						`\n[${group.slug}] ✓ All tests passed (${(duration / 1000).toFixed(2)}s)`,
					),
				);
			}
			return {
				group,
				success: true,
				output,
				duration,
				testSummary,
			};
		}

		if (!shouldDebug) {
			console.log(chalk.cyan("│"));
			console.log(
				chalk.cyan(
					`└─ ${chalk.red.bold("✗ Tests failed")} ${chalk.dim(`(${(duration / 1000).toFixed(2)}s)`)}`,
				),
			);
		} else {
			console.log(
				chalk.red.bold(
					`\n[${group.slug}] ✗ Tests failed (${(duration / 1000).toFixed(2)}s)`,
				),
			);
		}

		return {
			group,
			success: false,
			output,
			error: `Tests failed with exit code ${proc.exitCode}`,
			duration,
			testSummary,
		};
	} catch (error: any) {
		const duration = performance.now() - startTime;
		console.log(
			chalk.red.bold(
				`\n[${group.slug}] ✗ Error: ${error.message} (${(duration / 1000).toFixed(2)}s)`,
			),
		);
		return {
			group,
			success: false,
			output,
			error: error.message,
			duration,
		};
	}
}
