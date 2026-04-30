import { execSync } from "node:child_process";
import { loadLocalEnv } from "@/utils/envUtils";
import {
	createTestContext,
	type TestContext,
} from "./utils/testInitUtils/createTestContext";

const loadInfisicalSecrets = async () => {
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
 * Bun test preload script — runs ONCE per `bun test` invocation, BEFORE any
 * test file evaluates.
 *
 * Loads environment variables AND eagerly initializes the master-org
 * `TestContext` once, stashing it on `globalThis.__autumnTestContext`.
 * `createTestContext.ts`'s default export is a Proxy that reads this stash
 * lazily on property access — by deferring the lookup until first read,
 * we eliminate both the top-level-await TDZ and the import-order race
 * (the preload imports `createTestContext` to call its function, which
 * would normally evaluate the module BEFORE the preload populated the
 * stash; the Proxy makes that order irrelevant).
 *
 * Why we always run integration setup (no unit-vs-integration branch):
 *
 *  - When `bun test` is invoked with multiple paths, `process.argv` only
 *    contains the FIRST one — bun strips the rest before invoking the
 *    preload. Conditioning on argv is unreliable: a unit test listed
 *    first would skip the setup that the subsequent integration tests
 *    need, and they would fail with `defaultCtx is not initialized`.
 *
 *  - The createTestContext call is wrapped in try/catch so pure-unit
 *    environments (e.g. CI lanes that don't set TESTS_ORG) still complete
 *    the preload cleanly. Unit tests don't read the default ctx anyway,
 *    so a missing stash is fine for them.
 *
 *  - Cost for unit-only runs: ~1-2s (DB fetch + Stripe client init). The
 *    `bun t` test dispatcher (`scripts/testScripts/testDispatcher.ts`)
 *    already separates unit and integration runs in practice, so this
 *    overhead only hits direct-bun-test mixed runs.
 */

declare global {
	// biome-ignore lint/style/noVar: required for global declaration in TS
	var __autumnTestContext: TestContext | null | undefined;
}

console.log("--- Setup integration tests ---");
await loadInfisicalSecrets();
loadLocalEnv({ force: true });

try {
	globalThis.__autumnTestContext = await createTestContext();
	console.log("--- Setup integration tests complete ---");
} catch (err) {
	console.warn(
		"[preload] Skipping master-org TestContext initialization. " +
			"Integration tests that read the default ctx will fail with a clear " +
			"error. Reason:",
		err instanceof Error ? err.message : err,
	);
}
