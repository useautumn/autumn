import { execSync } from "node:child_process";
import { loadLocalEnv } from "@/utils/envUtils";
import type { TestContext } from "./utils/testInitUtils/createTestContext";

const loadInfisicalSecrets = async () => {
	// `bun test:integration` wraps the run in `infisical run --env=dev`, which
	// already injects every secret into the parent process. Workers inherit
	// those, so re-running the infisical CLI per worker is redundant churn
	// (and a flake source). Skip when env is clearly already populated.
	// CI never has the infisical CLI; this fetch is a local-dev convenience only.
	if (process.env.CI || process.env.STRIPE_TEST_KEY || process.env.TESTS_ORG)
		return;

	try {
		const secrets = execSync(
			"infisical secrets --env=dev --output=dotenv --recursive --silent",
			{ encoding: "utf-8" },
		);

		for (const line of secrets.split("\n")) {
			const match = line.match(/^([^=]+)=(.*)$/);
			if (match) {
				const key = match[1];
				if (process.env[key] !== undefined) continue;

				process.env[key] = match[2].replace(/^["']|["']$/g, "");
			}
		}
	} catch (e) {
		console.warn("Failed to load infisical secrets:", e);
	}
};

/**
 * Bun test preload — runs once per `bun test` before any test file evaluates.
 * Loads env vars and eagerly creates the master-org `TestContext`, stashing
 * it on `globalThis.__autumnTestContext`. `createTestContext.ts`'s default
 * export is a Proxy that reads the stash lazily, sidestepping import-order
 * races and top-level-await TDZ.
 *
 * Unit-only lanes (no TESTS_ORG) skip init entirely — unit tests don't read
 * the default ctx. Integration lanes let any init error throw so the worker
 * dies loudly instead of every test reporting the opaque Proxy error.
 */

declare global {
	// biome-ignore lint/style/noVar: required for global declaration in TS
	var __autumnTestContext: TestContext | null | undefined;
}

console.log("--- Setup integration tests ---");
await loadInfisicalSecrets();
loadLocalEnv({ force: true });

// Unit-only lanes don't set TESTS_ORG; silently skip there. Anything else
// must succeed — a swallowed init failure here resurfaces as the opaque
// "Default TestContext is not initialized" Proxy error from every test
// scheduled on this worker.
if (process.env.TESTS_ORG) {
	// Dynamic import: createTestContext drags in the server init graph (db,
	// redis, stripe), which unit-only lanes must never load or connect to.
	const { createTestContext } = await import(
		"./utils/testInitUtils/createTestContext"
	);
	globalThis.__autumnTestContext = await createTestContext();
	console.log("--- Setup integration tests complete ---");
}
