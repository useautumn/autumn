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
 * Bun test preload — runs once per `bun test` before any test file evaluates.
 * Loads env vars and eagerly creates the master-org `TestContext`, stashing
 * it on `globalThis.__autumnTestContext`. `createTestContext.ts`'s default
 * export is a Proxy that reads the stash lazily, sidestepping import-order
 * races and top-level-await TDZ.
 *
 * `createTestContext` is wrapped in try/catch so pure-unit lanes (no
 * TESTS_ORG) still preload cleanly — unit tests don't read the default ctx.
 * argv-based unit/integration branching isn't reliable (bun only passes the
 * first path).
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
