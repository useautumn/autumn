import { execSync } from "node:child_process";
import { loadLocalEnv } from "@/utils/envUtils";
import type { TestContext } from "./utils/testInitUtils/createTestContext";

const loadInfisicalSecrets = async () => {
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

declare global {
	// biome-ignore lint/style/noVar: required for global declaration in TS
	var __autumnTestContext: TestContext | null | undefined;
}

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

	const shardFiles = process.env.UNIT_TEST_FILES?.split("\n").filter(Boolean);
	if (shardFiles && shardFiles.length > 0) {
		const serverRoot = join(import.meta.dir, "..");
		for (const file of shardFiles) collectFrom(join(serverRoot, file));
	} else {
		walk(join(import.meta.dir, "unit"));
	}

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

if (process.env.TW_TEST_FILE && !process.env.UNIT_TESTS) {
	const { tagTwTestFileRequests } = await import(
		"./utils/tw/tagTwTestFileRequests"
	);
	await tagTwTestFileRequests({
		fileTag: process.env.TW_TEST_FILE,
		serverUrls: [
			process.env.AUTUMN_TEST_BASE_URL,
			process.env.AUTUMN_API_URL,
			process.env.AUTUMN_PUBLIC_API_URL,
		],
	});
}

if (process.env.UNIT_TESTS) await seedMockedModulesForUnitLane();

if (process.env.TESTS_ORG && !process.env.UNIT_TESTS) {
	const { createTestContext } = await import(
		"./utils/testInitUtils/createTestContext"
	);
	const testContext = await createTestContext();

	const { primeRedisMonitor } = await import(
		"@/external/redis/availabilityMonitor/redisAvailability.js"
	);
	const { primeRedisV2Monitor } = await import(
		"@/external/redis/availabilityMonitor/redisV2Availability.js"
	);
	await Promise.all([primeRedisMonitor(), primeRedisV2Monitor()]);

	const { startBalanceWorkerClient } = await import(
		"@/external/balanceWorker/getBalanceWorkerClient.js"
	);
	await startBalanceWorkerClient();

	await import("@/internal/misc/miscRedisConfig/miscRedisConfigStore.js");
	const { startAllEdgeConfigPolling } = await import(
		"@/internal/misc/edgeConfig/edgeConfigRegistry.js"
	);
	const { logger } = await import("@/external/logtail/logtailUtils.js");
	await startAllEdgeConfigPolling({ logger });
	const { getMiscRedisTargets } = await import(
		"@/external/redis/miscCache/resolveMiscRedis.js"
	);
	const { waitForRedisReady } = await import("@/external/redis/initRedis.js");
	for (const target of getMiscRedisTargets()) {
		await waitForRedisReady(target.redis, target.instanceName);
	}

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
