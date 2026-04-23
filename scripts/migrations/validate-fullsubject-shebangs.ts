/**
 * Validates that every FullSubject Lua script reachable via the Upstash
 * redisV2 path is prefixed with the `#!lua flags=allow-key-locking` shebang,
 * AND that Upstash is actually enforcing the flag on the live connection.
 *
 * Two layers:
 *  1. Static — reproduces the resolution path in initRedisV2.ts and asserts
 *     every FullSubject command registers with the shebang prepended.
 *  2. Live probe — connects to Upstash and exploits the fact that under
 *     `allow-key-locking`, calling `redis.call` on a key not in `KEYS[]`
 *     fails with a specific error. If the shebang-flagged probe errors and
 *     the unflagged control probe succeeds, key-locking is confirmed active.
 */

import { UPSTASH_KEY_LOCKING_SHEBANG } from "@server/_luaScriptsV2/luaScriptsV2";
import { getRedisV2ConnectionConfig } from "@server/external/redis/initUtils/redisV2Config";
import { registerRedisCommands } from "@server/external/redis/initUtils/registerRedisCommands";
import { Redis } from "ioredis";

// Commands whose Lua bodies read/write FullSubject cache keys. Any command
// that touches the FullSubject cache on redisV2 MUST appear here.
const FULL_SUBJECT_COMMANDS = [
	"deductFromSubjectBalances",
	"updateSubjectBalances",
	"setCachedFullSubject",
	"adjustSubjectBalance",
	"updateFullSubjectCustomerDataV2",
	"updateFullSubjectEntityDataV2",
	"updateFullSubjectCustomerProductV2",
	"upsertInvoiceInFullSubjectV2",
] as const;

type CapturedCommand = { lua: string; numberOfKeys?: number };

const captured = new Map<string, CapturedCommand>();

const stubRedis = {
	defineCommand(
		name: string,
		definition: { lua: string; numberOfKeys?: number },
	) {
		captured.set(name, definition);
	},
	on() {},
} as unknown as Parameters<typeof registerRedisCommands>[0]["redisInstance"];

const v2Config = getRedisV2ConnectionConfig({
	cacheV2Url: process.env.CACHE_V2_UPSTASH_URL,
	primaryCacheUrl: process.env.CACHE_URL,
	currentRegion: "validate",
});

if (!v2Config) {
	console.error(
		"❌ No distinct CACHE_V2_UPSTASH_URL configured — redisV2 is falling back to the primary cache, so Upstash key-locking is NOT in effect.",
	);
	console.error(
		"   Set CACHE_V2_UPSTASH_URL to a value different from CACHE_URL and re-run.",
	);
	process.exit(1);
}

const { supportsUpstashShebang } = v2Config;

console.log(
	`Resolved redisV2 path: supportsUpstashShebang=${supportsUpstashShebang} (region=${v2Config.region})`,
);

registerRedisCommands({
	redisInstance: stubRedis,
	supportsUpstashShebang,
});

const failures: string[] = [];

for (const commandName of FULL_SUBJECT_COMMANDS) {
	const definition = captured.get(commandName);
	if (!definition) {
		failures.push(`  - ${commandName}: NOT REGISTERED`);
		continue;
	}
	if (!definition.lua.startsWith(UPSTASH_KEY_LOCKING_SHEBANG)) {
		const firstLine = definition.lua.split("\n")[0];
		failures.push(
			`  - ${commandName}: missing shebang (first line: "${firstLine}")`,
		);
		continue;
	}
	console.log(`✅ ${commandName}: shebang present`);
}

if (failures.length > 0) {
	console.error("\n❌ FullSubject shebang validation failed:");
	for (const line of failures) console.error(line);
	process.exit(1);
}

console.log(
	`\n✅ All ${FULL_SUBJECT_COMMANDS.length} FullSubject scripts carry the Upstash key-locking shebang.`,
);

// -----------------------------------------------------------------------------
// Live probe against Upstash
// -----------------------------------------------------------------------------
//
// Proves Upstash is ENFORCING the flag, not just accepting the shebang.
//
//   flagged probe   — shebang present, reads a key not in KEYS[] → must fail
//                     with "Dynamic keys are not allowed ..."
//   control probe   — same script, no shebang                   → must succeed
//
// Both probes are read-only (`GET` on a random namespaced key) and pass 0
// KEYS, so they never mutate Upstash state.

const upstashUrl = process.env.CACHE_V2_UPSTASH_URL?.trim();
if (!upstashUrl) {
	console.error("\n❌ CACHE_V2_UPSTASH_URL missing for live probe.");
	process.exit(1);
}

console.log("\nRunning live Upstash probe...");

const probeClient = new Redis(upstashUrl, {
	tls: process.env.CACHE_CERT ? { ca: process.env.CACHE_CERT } : undefined,
	family: 4,
	maxRetriesPerRequest: 2,
	commandTimeout: 10_000,
});

const probeKey = `autumn:shebang_probe:${Date.now()}:${Math.random().toString(36).slice(2)}`;
const probeBody = `redis.call('GET', '${probeKey}')\nreturn 'OK'`;
const flaggedScript = `${UPSTASH_KEY_LOCKING_SHEBANG}${probeBody}`;
const controlScript = probeBody;

const DYNAMIC_KEYS_ERROR_FRAGMENT = "Dynamic keys are not allowed";

try {
	// Flagged probe — expect rejection.
	let flaggedResult: unknown;
	let flaggedError: Error | undefined;
	try {
		flaggedResult = await probeClient.eval(flaggedScript, 0);
	} catch (err) {
		flaggedError = err as Error;
	}

	if (!flaggedError) {
		console.error(
			`❌ Flagged probe unexpectedly succeeded (returned ${JSON.stringify(flaggedResult)}). Upstash did NOT enforce allow-key-locking — either the connection is not an Upstash database, or the flag was stripped somewhere in the pipeline.`,
		);
		process.exit(1);
	}

	if (!flaggedError.message.includes(DYNAMIC_KEYS_ERROR_FRAGMENT)) {
		console.error(
			`❌ Flagged probe errored, but not with the expected "${DYNAMIC_KEYS_ERROR_FRAGMENT}" message. Got: ${flaggedError.message}`,
		);
		process.exit(1);
	}

	console.log(
		`✅ Flagged probe rejected by Upstash: "${flaggedError.message.trim()}"`,
	);

	// Control probe — same script without shebang must succeed.
	const controlResult = await probeClient.eval(controlScript, 0);
	if (controlResult !== "OK") {
		console.error(
			`❌ Control probe returned unexpected value: ${JSON.stringify(controlResult)}`,
		);
		process.exit(1);
	}
	console.log("✅ Control probe (no shebang) succeeded — baseline confirmed.");

	console.log(
		"\n✅ 100% verified: Upstash is enforcing allow-key-locking on this connection, and every FullSubject script carries the shebang.",
	);
	await probeClient.quit();
	process.exit(0);
} catch (err) {
	console.error("❌ Live probe failed:", err);
	try {
		await probeClient.quit();
	} catch {}
	process.exit(1);
}
