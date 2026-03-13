// Shared test setup and utilities

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.test from test directory
config({ path: resolve(__dirname, ".env.test") });

// Path to the built CLI
export const CLI_PATH = resolve(__dirname, "../dist/cli.js");

// Test fixtures base path
export const FIXTURES_PATH = resolve(__dirname, "./fixtures");

// Get API key from test environment variable
export const AUTUMN_SECRET_KEY = process.env.UNIT_TEST_AUTUMN_SECRET_KEY;

if (!AUTUMN_SECRET_KEY) {
	throw new Error(
		"UNIT_TEST_AUTUMN_SECRET_KEY environment variable is required to run tests.\n" +
			"Set it to your Autumn sandbox API key.",
	);
}

// Also set AUTUMN_SECRET_KEY in process.env so API functions can use it directly
process.env.AUTUMN_SECRET_KEY = AUTUMN_SECRET_KEY;

// Environment setup - inject the API key into spawned processes
// Note: shell: false to avoid path escaping issues with spaces
export const spawnOpts = {
	env: {
		...process.env,
		AUTUMN_SECRET_KEY,
	},
	shell: false,
};

// Helper to create a temp directory
export function createTempDir(prefix: string = "atmn-test-"): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

// Helper to cleanup a temp directory
export function cleanupTempDir(dir: string): void {
	if (dir && existsSync(dir)) {
		rmSync(dir, { recursive: true, force: true });
	}
}

// Re-export fs helpers for convenience
export { existsSync, readFileSync, join };

// Re-export API functions for state verification in tests
// Using lazy-loaded wrapper to ensure env is loaded first
export { type Feature, getAllPlans, getFeatures, type Plan } from "./api.js";
