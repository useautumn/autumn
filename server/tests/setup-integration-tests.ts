import { execSync } from "node:child_process";
import { loadLocalEnv } from "@/utils/envUtils";
import type { TestContext } from "./utils/testInitUtils/createTestContext";

const loadInfisicalSecrets = async () => {
	// `bun test:integration` wraps the run in `infisical run --env=dev`, which
	// already injects every secret into the parent process. Workers inherit
	// those, so re-running the infisical CLI per worker is redundant churn
	// (and a flake source). Skip when env is clearly already populated.
	// CI never has the infisical CLI; this fetch is a local-dev convenience only.
	// Unit lanes (UNIT_TESTS=1) are hermetic and never need secrets — the
	// infisical shell-out costs ~2s per process, so skip it there too.
	if (
		process.env.CI ||
		process.env.UNIT_TESTS ||
		process.env.STRIPE_TEST_KEY ||
		process.env.TESTS_ORG
	)
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

/**
 * Unit lane only: pre-import every module that any unit test mock.module()s.
 *
 * bun's mock.module MERGES into a module that is already in the registry but
 * fully REPLACES one that is not — so a partial factory (most of ours) breaks
 * every export it omits for all later files in the process. Whether the real
 * module loaded first depends on file execution order, and bun test runs
 * files in filesystem-discovery order, which differs across OSes (APFS is
 * sorted, ext4 is not) — green on macOS, red in CI. Seeding the registry up
 * front makes every mock a merge regardless of order.
 */
const seedMockedModulesForUnitLane = async () => {
	const { readdirSync, readFileSync, statSync } = await import("node:fs");
	const { join } = await import("node:path");

	const specifiers = new Set<string>();
	const collectFrom = (file: string) => {
		const source = readFileSync(file, "utf8");
		for (const match of source.matchAll(/mock\.module\(\s*["']([^"']+)["']/g)) {
			specifiers.add(match[1]);
		}
	};
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir)) {
			const full = join(dir, entry);
			if (statSync(full).isDirectory()) walk(full);
			else if (/\.(test|spec)\.tsx?$/.test(entry)) collectFrom(full);
		}
	};

	// The sharded runner passes its shard's file list so each shard only pays
	// the import graphs its own files can mock; plain `bun test` runs (no
	// list) seed from the whole tree.
	const shardFiles = process.env.UNIT_TEST_FILES?.split("\n").filter(Boolean);
	if (shardFiles && shardFiles.length > 0) {
		const serverRoot = join(import.meta.dir, "..");
		for (const file of shardFiles) collectFrom(join(serverRoot, file));
	} else {
		walk(join(import.meta.dir, "unit"));
	}

	// Relative specifiers are file-local; everything else is importable here.
	const importable = [...specifiers].filter(
		(specifier) => !specifier.startsWith("."),
	);
	const results = await Promise.allSettled(
		importable.map((specifier) => import(specifier)),
	);
	const failures = results.filter((result) => result.status === "rejected");
	if (failures.length > 0) {
		console.warn(
			`[unit-seed] ${failures.length}/${importable.length} mocked modules failed to pre-import`,
		);
	}
};

console.log("--- Setup integration tests ---");
await loadInfisicalSecrets();
loadLocalEnv({ force: true });
process.env.AUTUMN_API_URL ??= "http://localhost:8080";
process.env.AUTUMN_PUBLIC_API_URL ??= "http://localhost:8080";

if (process.env.UNIT_TESTS) await seedMockedModulesForUnitLane();

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
	const testContext = await createTestContext();

	// Availability defaults to degraded until primed (normally at server boot);
	// unprimed, in-process finalize/track calls silently fail open to SQS replays.
	const { primeRedisMonitor } = await import(
		"@/external/redis/availabilityMonitor/redisAvailability.js"
	);
	const { primeRedisV2Monitor } = await import(
		"@/external/redis/availabilityMonitor/redisV2Availability.js"
	);
	await Promise.all([primeRedisMonitor(), primeRedisV2Monitor()]);

	if (!testContext.org.config.multi_currency) {
		const { db } = await import("@/db/initDrizzle.js");
		const { OrgService } = await import("@/internal/orgs/OrgService.js");
		const { clearOrgCache } = await import(
			"@/internal/orgs/orgUtils/clearOrgCache.js"
		);
		const { getMiscRedis, waitForRedisReady } = await import(
			"@/external/redis/initRedis.js"
		);
		const config = { ...testContext.org.config, multi_currency: true };
		await OrgService.update({
			db,
			orgId: testContext.org.id,
			updates: { config },
		});
		await waitForRedisReady(getMiscRedis(), "main");
		await clearOrgCache({ db, orgId: testContext.org.id });
		testContext.org.config = config;
	}

	globalThis.__autumnTestContext = testContext;
	console.log("--- Setup integration tests complete ---");
}
