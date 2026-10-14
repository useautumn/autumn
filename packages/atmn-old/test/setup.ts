import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, ".env.test") });

export const CLI_PATH = resolve(__dirname, "../dist/cli.js");

export const FIXTURES_PATH = resolve(__dirname, "./fixtures");

export const AUTUMN_SECRET_KEY = process.env.UNIT_TEST_AUTUMN_SECRET_KEY;

if (!AUTUMN_SECRET_KEY) {
	throw new Error(
		"UNIT_TEST_AUTUMN_SECRET_KEY environment variable is required to run tests.\n" +
			"Set it to your Autumn sandbox API key.",
	);
}

process.env.AUTUMN_SECRET_KEY = AUTUMN_SECRET_KEY;

export const spawnOpts = {
	env: {
		...process.env,
		AUTUMN_SECRET_KEY,
	},
	shell: false,
};

export function createTempDir(prefix: string = "atmn-test-"): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

export function cleanupTempDir(dir: string): void {
	if (dir && existsSync(dir)) {
		rmSync(dir, { recursive: true, force: true });
	}
}

export { existsSync, readFileSync, join };

export { type Feature, getAllPlans, getFeatures, type Plan } from "./api.js";
