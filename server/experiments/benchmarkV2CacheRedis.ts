import { AppEnv } from "@autumn/shared";
import type { Redis } from "ioredis";
import {
    initDrizzle,
    prodTestCustomerId,
    prodTestEntityId,
    prodTestOrgId,
} from "./experimentEnv";

// ---------------------------------------------------------------------------
// EDIT ME — hardcode the customer / feature you want to diagnose
// ---------------------------------------------------------------------------
const CONFIG = {
	orgId: prodTestOrgId as string,
	env: AppEnv.Live as AppEnv,
	customerId: prodTestCustomerId as string,
	entityId: prodTestEntityId as string | undefined, // or undefined
	featureId: undefined as string | undefined, // set to isolate to one feature
	iterations: 5,
	runLua: true, // lua writes back entitlement hashes even for amount=0 — disable if paranoid
	forceRepopulate: true, // DEL the cached subject before priming, so it's rebuilt from the DB
};
// ---------------------------------------------------------------------------

const { resolveRedisV2 } = await import("../src/external/redis/resolveRedisV2");
const { warmupRedisV2 } = await import("../src/external/redis/initRedisV2");
const { buildFullSubjectKey } = await import(
	"../src/internal/customers/cache/fullSubject/builders/buildFullSubjectKey"
);
const { buildSharedFullSubjectBalanceKey } = await import(
	"../src/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey"
);
const { buildDeductFromSubjectBalancesKeys } = await import(
	"../src/internal/customers/cache/fullSubject/builders/buildDeductFromSubjectBalancesKeys"
);
const { getOrInitFullSubjectViewEpoch } = await import(
	"../src/internal/customers/cache/fullSubject/actions/invalidate/getOrInitFullSubjectViewEpoch"
);
const { getCachedFeatureBalancesBatch } = await import(
	"../src/internal/customers/cache/fullSubject/balances/getCachedFeatureBalances"
);
const { getOrSetCachedFullSubject } = await import(
	"../src/internal/customers/cache/fullSubject/actions/getOrSetCachedFullSubject"
);
const { sanitizeCachedFullSubject } = await import(
	"../src/internal/customers/cache/fullSubject/sanitize/index"
);
const { AGGREGATED_BALANCE_FIELD } = await import(
	"../src/internal/customers/cache/fullSubject/config/fullSubjectCacheConfig"
);

type Step = { name: string; ms: number; extra?: string };
type Iter = { index: number; steps: Step[] };

const nowMs = () => performance.now();

const time = async <T>(
	name: string,
	fn: () => Promise<T>,
): Promise<{ step: Step; value: T }> => {
	const start = nowMs();
	const value = await fn();
	const ms = nowMs() - start;
	return { step: { name, ms }, value };
};

const makeCtx = ({ redisV2, db }: { redisV2: Redis; db: unknown }) =>
	({
		org: { id: CONFIG.orgId },
		env: CONFIG.env,
		redisV2,
		db,
		dbGeneral: db,
		features: [],
		skipCache: false,
		isPublic: false,
		extraLogs: {},
		logger: {
			debug: (...a: unknown[]) => console.debug(...a),
			info: (...a: unknown[]) => console.info(...a),
			warn: (...a: unknown[]) => console.warn(...a),
			error: (...a: unknown[]) => console.error(...a),
		},
	}) as unknown as Parameters<typeof getOrInitFullSubjectViewEpoch>[0]["ctx"];

const pct = (sorted: number[], p: number): number => {
	if (sorted.length === 0) return 0;
	const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
	return sorted[idx];
};

const summarize = (all: Iter[]) => {
	const byStep = new Map<string, number[]>();
	for (const iter of all) {
		for (const step of iter.steps) {
			const arr = byStep.get(step.name) ?? [];
			arr.push(step.ms);
			byStep.set(step.name, arr);
		}
	}

	console.log("\n=== Summary (ms) ===");
	console.log(
		"step".padEnd(48),
		"min".padStart(8),
		"p50".padStart(8),
		"p95".padStart(8),
		"max".padStart(8),
	);
	for (const [name, arr] of byStep) {
		const sorted = [...arr].sort((a, b) => a - b);
		console.log(
			name.padEnd(48),
			sorted[0].toFixed(2).padStart(8),
			pct(sorted, 50).toFixed(2).padStart(8),
			pct(sorted, 95).toFixed(2).padStart(8),
			sorted[sorted.length - 1].toFixed(2).padStart(8),
		);
	}
};

const runIteration = async ({
	i,
	redisV2,
	ctx,
}: {
	i: number;
	redisV2: Redis;
	// biome-ignore lint/suspicious/noExplicitAny: stub ctx
	ctx: any;
}): Promise<Iter> => {
	const steps: Step[] = [];
	const subjectKey = buildFullSubjectKey({
		orgId: CONFIG.orgId,
		env: CONFIG.env,
		customerId: CONFIG.customerId,
		entityId: CONFIG.entityId,
	});

	// A1. GET subject
	const { step: s1, value: cachedRaw } = await time(
		"GET full_subject",
		() => redisV2.get(subjectKey),
	);
	steps.push({ ...s1, extra: cachedRaw ? `${cachedRaw.length}b` : "null" });

	if (!cachedRaw) {
		console.log(`  iter ${i}: no cached subject — stopping this iteration`);
		return { index: i, steps };
	}

	// parse
	const { step: sParse, value: cached } = await time(
		"JSON.parse + sanitize",
		async () =>
			sanitizeCachedFullSubject({
				cachedFullSubject: JSON.parse(cachedRaw),
			}),
	);
	steps.push(sParse);

	if (i === 1) {
		const sizeOf = (v: unknown) => JSON.stringify(v ?? null).length;
		const cachedAny = cached as unknown as Record<string, unknown>;
		const entries = Object.keys(cachedAny)
			.map((k) => ({ k, bytes: sizeOf(cachedAny[k]) }))
			.sort((a, b) => b.bytes - a.bytes);
		const total = entries.reduce((a, e) => a + e.bytes, 0);
		console.log(`    blob anatomy (total ${(total / 1024).toFixed(1)}kb):`);
		for (const e of entries.slice(0, 8)) {
			const pct = ((e.bytes / total) * 100).toFixed(1);
			console.log(
				`      ${(e.bytes / 1024).toFixed(1).padStart(8)}kb  ${pct.padStart(5)}%  ${e.k}`,
			);
		}
	}

	// A2. epoch
	const { step: s2 } = await time("getOrInitFullSubjectViewEpoch", () =>
		getOrInitFullSubjectViewEpoch({ ctx, customerId: CONFIG.customerId }),
	);
	steps.push(s2);

	const meteredFeatures = CONFIG.featureId
		? cached.meteredFeatures.filter((f: string) => f === CONFIG.featureId)
		: cached.meteredFeatures;

	const includeAggregated = !CONFIG.entityId;

	// A3. batch hmget pipeline
	const { step: s3, value: batchOutcome } = await time(
		`getCachedFeatureBalancesBatch (${meteredFeatures.length} features)`,
		() =>
			getCachedFeatureBalancesBatch({
				ctx,
				customerId: CONFIG.customerId,
				featureIds: meteredFeatures,
				customerEntitlementIdsByFeatureId:
					cached.customerEntitlementIdsByFeatureId,
				includeAggregated,
			}),
	);
	steps.push({ ...s3, extra: batchOutcome.kind });

	// A4. sequential per-feature HMGET with per-feature timing (slow-key hunt)
	const perFeature: Array<{ featureId: string; ms: number; bytes: number }> =
		[];
	const { step: s4 } = await time(
		`sequential HMGET per feature (${meteredFeatures.length} calls)`,
		async () => {
			for (const featureId of meteredFeatures) {
				const ids =
					cached.customerEntitlementIdsByFeatureId[featureId] ?? [];
				const fields = includeAggregated
					? [...ids, AGGREGATED_BALANCE_FIELD]
					: ids;
				const balanceKey = buildSharedFullSubjectBalanceKey({
					orgId: CONFIG.orgId,
					env: CONFIG.env,
					customerId: CONFIG.customerId,
					featureId,
				});
				const t = nowMs();
				let bytes = 0;
				if (fields.length === 0) {
					await redisV2.exists(balanceKey);
				} else {
					const vals = (await redisV2.hmget(
						balanceKey,
						...fields,
					)) as (string | null)[];
					bytes = vals.reduce((a, v) => a + (v?.length ?? 0), 0);
				}
				perFeature.push({ featureId, ms: nowMs() - t, bytes });
			}
		},
	);
	steps.push(s4);

	// Only print on first iteration to keep output tidy
	if (i === 1) {
		const sorted = [...perFeature].sort((a, b) => b.ms - a.ms);
		console.log("    top-5 slowest features (seq HMGET):");
		for (const f of sorted.slice(0, 5)) {
			console.log(
				`      ${f.ms.toFixed(2).padStart(7)}ms  ${(f.bytes / 1024).toFixed(1).padStart(6)}kb  ${f.featureId}`,
			);
		}
	}

	// C. dry lua invocation (amount_to_deduct=0)
	if (CONFIG.runLua && meteredFeatures.length > 0) {
		const customerEntitlementDeductions: Array<{
			customer_entitlement_id: string;
			credit_cost: number;
			feature_id: string;
			entity_feature_id: string | null;
			usage_allowed: boolean;
			min_balance: number;
			max_balance: number;
		}> = [];

		for (const featureId of meteredFeatures) {
			const ids = cached.customerEntitlementIdsByFeatureId[featureId] ?? [];
			for (const id of ids) {
				customerEntitlementDeductions.push({
					customer_entitlement_id: id,
					credit_cost: 0,
					feature_id: featureId,
					entity_feature_id: null,
					usage_allowed: false,
					min_balance: 0,
					max_balance: 0,
				});
			}
		}

		if (customerEntitlementDeductions.length === 0) {
			console.log("  (skipping lua — no customer entitlements)");
		} else {
			const routingKey = subjectKey;
			const { keys, balanceKeyIndexByFeatureId } =
				buildDeductFromSubjectBalancesKeys({
					orgId: CONFIG.orgId,
					env: CONFIG.env,
					customerId: CONFIG.customerId,
					routingKey,
					lockReceiptKey: null,
					customerEntitlementDeductions,
					fallbackFeatureId:
						CONFIG.featureId ?? meteredFeatures[0] ?? "unknown",
				});

			const luaParams = {
				org_id: CONFIG.orgId,
				env: CONFIG.env,
				customer_id: CONFIG.customerId,
				customer_entitlement_deductions: customerEntitlementDeductions,
				balance_key_index_by_feature_id: balanceKeyIndexByFeatureId,
				spend_limit_by_feature_id: null,
				usage_based_cus_ent_ids_by_feature_id: null,
				amount_to_deduct: 0,
				target_balance: null,
				target_entity_id: CONFIG.entityId ?? null,
				rollovers: null,
				skip_additional_balance: false,
				alter_granted_balance: false,
				overage_behaviour: "cap",
				feature_id: CONFIG.featureId ?? meteredFeatures[0],
				lock: null,
				unwind_value: null,
				debug: true,
			};

			const { step: sLua, value: luaRaw } = await time(
				`deductFromSubjectBalances lua (${keys.length} keys, ${customerEntitlementDeductions.length} ents)`,
				() =>
					// biome-ignore lint/suspicious/noExplicitAny: ioredis custom command typed via module augmentation not available here
					(redisV2 as any).deductFromSubjectBalances(
						keys.length,
						...keys,
						JSON.stringify(luaParams),
					),
			);
			steps.push(sLua);

			try {
				const luaResult = JSON.parse(luaRaw as string);
				if (luaResult.error) {
					console.log(`    lua error: ${luaResult.error}`);
				}
				if (i === 1 && luaResult.logs?.length) {
					console.log(`    lua logs (${luaResult.logs.length} lines):`);
					for (const line of luaResult.logs) console.log(`      ${line}`);
				}
			} catch {
				console.log("    (lua result unparseable)");
			}
		}
	}

	return { index: i, steps };
};

const main = async () => {
	console.log("=== V2 cache Redis benchmark ===");
	console.log("config:", {
		orgId: CONFIG.orgId,
		env: CONFIG.env,
		customerId: CONFIG.customerId,
		entityId: CONFIG.entityId,
		featureId: CONFIG.featureId,
		iterations: CONFIG.iterations,
		runLua: CONFIG.runLua,
	});

	const { db } = initDrizzle();
	const redisV2 = resolveRedisV2();
	await warmupRedisV2();

	const ctx = makeCtx({ redisV2, db });

	// Prime the cache if cold, so the iteration benchmarks always measure a hit path.
	const subjectKey = buildFullSubjectKey({
		orgId: CONFIG.orgId,
		env: CONFIG.env,
		customerId: CONFIG.customerId,
		entityId: CONFIG.entityId,
	});
	if (CONFIG.forceRepopulate) {
		// Grab meteredFeatures from the existing subject so we know which
		// balance hashes to drop. All keys share the {customerId} hash tag,
		// so a single DEL across them is slot-safe.
		const staleRaw = await redisV2.get(subjectKey);
		const balanceKeys: string[] = [];
		if (staleRaw) {
			try {
				const stale = JSON.parse(staleRaw) as {
					meteredFeatures?: string[];
				};
				for (const featureId of stale.meteredFeatures ?? []) {
					balanceKeys.push(
						buildSharedFullSubjectBalanceKey({
							orgId: CONFIG.orgId,
							env: CONFIG.env,
							customerId: CONFIG.customerId,
							featureId,
						}),
					);
				}
			} catch {
				console.warn("  (could not parse stale subject to extract balance keys)");
			}
		}
		const toDel = [subjectKey, ...balanceKeys];
		const deleted = await redisV2.del(...toDel);
		console.log(
			`\n--- forceRepopulate: DEL ${toDel.length} keys (subject + ${balanceKeys.length} balance hashes) → ${deleted} removed ---`,
		);
	}

	const existing = await redisV2.get(subjectKey);
	if (!existing) {
		console.log("\n--- priming cache (cold) ---");
		const t0 = nowMs();
		try {
			await getOrSetCachedFullSubject({
				ctx,
				customerId: CONFIG.customerId,
				entityId: CONFIG.entityId,
				source: "benchmarkV2CacheRedis",
			});
			console.log(`  primed in ${(nowMs() - t0).toFixed(2)}ms`);
		} catch (err) {
			console.error("  prime failed:", err);
			console.error(
				"  (cache is cold and cannot be populated from this script — aborting)",
			);
			process.exit(1);
		}
	} else {
		console.log(`\ncache already warm (${existing.length}b)`);
	}

	const all: Iter[] = [];
	for (let i = 1; i <= CONFIG.iterations; i++) {
		console.log(`\n--- iteration ${i} ---`);
		const iter = await runIteration({ i, redisV2, ctx });
		for (const step of iter.steps) {
			const extra = step.extra ? `  (${step.extra})` : "";
			console.log(`  ${step.ms.toFixed(2).padStart(8)}ms  ${step.name}${extra}`);
		}
		all.push(iter);
	}

	summarize(all);
	process.exit(0);
};

await main();
