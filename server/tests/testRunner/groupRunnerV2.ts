#!/usr/bin/env bun

import dotenv from "dotenv";
import { resolve } from "path";
import { spawn } from "bun";

// Load environment variables from server/.env
dotenv.config({ path: resolve(import.meta.dir, "..", "..", ".env") });

import type { TestGroup } from "./config.js";
import { runTests } from "./runTestsV2.js";

export type TestFileProgress = {
	name: string;
	status: "pending" | "running" | "passed" | "failed";
	duration?: number;
	error?: string;
	output?: string; // Full test output for debugging
};

export type GroupProgress = {
	status: "pending" | "setup" | "running" | "passed" | "failed";
	files: TestFileProgress[];
	duration?: number;
	error?: string;
};

export type ProgressCallback = (progress: GroupProgress) => void;

export type GroupResult = {
	group: TestGroup;
	success: boolean;
	output: string;
	error?: string;
	duration: number;
	files: TestFileProgress[];
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
		// If org doesn't exist (404), that's fine - we just wanted it deleted anyway
		if (response.status === 404) {
			return;
		}
		const error = await response.text();
		throw new Error(
			`Failed to delete org ${slug}: ${response.status} ${error}`,
		);
	}
}

/**
 * Calls the platform API to get existing org credentials
 */
async function getExistingOrg({
	slug,
}: {
	slug: string;
}): Promise<{ secretKey: string; fullSlug: string } | null> {
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
			org_slug: slug,
		}),
	});

	if (!response.ok) {
		if (response.status === 404) {
			return null;
		}
		const error = await response.text();
		throw new Error(
			`Failed to get org ${slug}: ${response.status} ${error}`,
		);
	}

	const data = await response.json();
	if (!data.test_secret_key) {
		throw new Error(`No test_secret_key returned for org ${slug}`);
	}

	return {
		secretKey: data.test_secret_key,
		fullSlug: slug,
	};
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

	// Wait a moment for API key cache to propagate
	await new Promise((resolve) => setTimeout(resolve, 1000));

	return {
		secretKey: data.test_secret_key,
		fullSlug: data.org_slug,
	};
}

/**
 * Parse test file list from directory paths
 */
async function getTestFiles(paths: string[]): Promise<string[]> {
	const { readdir } = await import("fs/promises");
	const testFiles: string[] = [];

	for (const path of paths) {
		const resolvedPath = resolve(process.cwd(), path);

		// Check if it's a specific test file
		if (path.endsWith(".test.ts")) {
			testFiles.push(resolvedPath);
			continue;
		}

		// Otherwise treat it as a directory
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
 * Extract file name from path
 */
function getFileName(filePath: string): string {
	return filePath.split("/").pop() || filePath;
}


/**
 * Runs tests for a single group with progress callbacks
 */
export async function runTestGroupV2({
	group,
	skipSetup = false,
	onProgress,
}: {
	group: TestGroup;
	skipSetup?: boolean;
	onProgress?: ProgressCallback;
}): Promise<GroupResult> {
	const startTime = performance.now();
	let output = "";

	// Get test files upfront
	const testFilePaths = await getTestFiles(group.paths);
	const files: TestFileProgress[] = testFilePaths.map((path) => ({
		name: getFileName(path),
		status: "pending" as const,
	}));

	// Report initial state
	onProgress?.({
		status: skipSetup ? "running" : "setup",
		files,
		duration: 0,
	});

	try {
		let secretKey: string;
		let fullSlug: string;

		if (skipSetup) {
			// Try to get org from API
			const existing = await getExistingOrg({ slug: group.slug });
			if (!existing) {
				throw new Error(
					`Cannot skip setup: org ${group.slug} not found. Run with --setup flag to create it: bun t ${group.slug} --setup`,
				);
			}
			secretKey = existing.secretKey;
			fullSlug = existing.fullSlug;
		} else {
			// 1. Delete existing org
			try {
				await deleteOrg({ slug: group.slug });
			} catch (error: any) {
				// Ignore delete errors
			}

			// 2. Create new org
			const orgResult = await createOrg({
				slug: group.slug,
				name: `Test Group: ${group.slug}`,
				userEmail: "test@gmail.com",
			});
			secretKey = orgResult.secretKey;
			fullSlug = orgResult.fullSlug;

			// 3. Run setup
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

			// Collect setup output silently
			let setupOutput = "";
			const setupDecoder = new TextDecoder();
			if (setupProc.stdout) {
				for await (const chunk of setupProc.stdout) {
					setupOutput += setupDecoder.decode(chunk);
				}
			}
			if (setupProc.stderr) {
				for await (const chunk of setupProc.stderr) {
					setupOutput += setupDecoder.decode(chunk);
				}
			}

			await setupProc.exited;
			if (setupProc.exitCode !== 0) {
				throw new Error(
					`Setup failed for ${group.slug}: ${setupOutput.slice(0, 500)}`,
				);
			}
		}

		// 5. Run tests with real-time progress callbacks
		onProgress?.({
			status: "running",
			files,
			duration: performance.now() - startTime,
		});

		// Set environment for test execution
		process.env.UNIT_TEST_AUTUMN_SECRET_KEY = secretKey;
		process.env.TESTS_ORG = fullSlug;

		// Run tests with progress callbacks
		const results = await runTests(group.paths, {
			maxParallel: 6,
			progress: {
				onTestStart: (file) => {
					const fileName = getFileName(file);
					const fileIndex = files.findIndex((f) => f.name === fileName);
					if (fileIndex !== -1) {
						files[fileIndex].status = "running";
						onProgress?.({
							status: "running",
							files: [...files],
							duration: performance.now() - startTime,
						});
					}
				},
				onTestComplete: (file, result) => {
					const fileName = getFileName(file);
					const fileIndex = files.findIndex((f) => f.name === fileName);
					if (fileIndex !== -1) {
						files[fileIndex].status = result.status;
						files[fileIndex].duration = result.duration;
						if (result.error) {
							files[fileIndex].error = result.error;
						}
						if (result.output) {
							files[fileIndex].output = result.output;
						}
						onProgress?.({
							status: "running",
							files: [...files],
							duration: performance.now() - startTime,
						});
					}
				},
			},
		});

		const duration = performance.now() - startTime;
		const success = results.every((r) => r.status === "passed");

		onProgress?.({
			status: success ? "passed" : "failed",
			files,
			duration,
		});

		return {
			group,
			success,
			output,
			duration,
			files,
			error: success ? undefined : "One or more tests failed",
		};
	} catch (error: any) {
		const duration = performance.now() - startTime;

		onProgress?.({
			status: "failed",
			files,
			duration,
			error: error.message,
		});

		return {
			group,
			success: false,
			output,
			error: error.message,
			duration,
			files,
		};
	}
}
