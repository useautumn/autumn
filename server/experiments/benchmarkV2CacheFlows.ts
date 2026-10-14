import { AppEnv, normalizedToFullSubject } from "@autumn/shared";
import type { Redis } from "ioredis";
import {
	initDrizzle,
	prodTestCustomerId,
	prodTestEntityId,
	prodTestOrgId,
} from "./experimentEnv";

const CONFIG = {
	orgId: prodTestOrgId as string,
	env: AppEnv.Live as AppEnv,
	customerId: prodTestCustomerId as string,
	entityId: prodTestEntityId as string | undefined,
	iterations: 10,
	flows: {
		checkHit: true,
		checkMiss: true,
		createCustomerHit: true,
		createCustomerMiss: true,
	},
};

const { resolveRedisV2 } = await import("../src/external/redis/resolveRedisV2");
const { warmupRedisV2 } = await import("../src/external/redis/initRedisV2");
const { getCachedFullSubject } = await import(
	"../src/internal/customers/cache/fullSubject/actions/getCachedFullSubject"
);
const { getOrInitFullSubjectViewEpoch } = await import(
	"../src/internal/customers/cache/fullSubject/actions/invalidate/getOrInitFullSubjectViewEpoch"
);
const { setCachedFullSubject } = await import(
	"../src/internal/customers/cache/fullSubject/actions/setCachedFullSubject/setCachedFullSubject"
);
const { getFullSubjectNormalized } = await import(
	"../src/internal/customers/repos/getFullSubject"
);
const { getCachedFeatureBalancesBatch } = await import(
	"../src/internal/customers/cache/fullSubject/balances/getCachedFeatureBalances"
);
const { buildFullSubjectKey } = await import(
	"../src/internal/customers/cache/fullSubject/builders/buildFullSubjectKey"
);
const { buildFullSubjectViewEpochKey } = await import(
	"../src/internal/customers/cache/fullSubject/builders/buildFullSubjectViewEpochKey"
);
const { FULL_SUBJECT_EPOCH_TTL_SECONDS } = await import(
	"../src/internal/customers/cache/fullSubject/config/fullSubjectCacheConfig"
);
const { buildSharedFullSubjectBalanceKey } = await import(
	"../src/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey"
);
const { sanitizeCachedFullSubject } = await import(
	"../src/internal/customers/cache/fullSubject/sanitize/index"
);
const { cachedFullSubjectToNormalized } = await import(
	"../src/internal/customers/cache/fullSubject/fullSubjectCacheModel"
);
const { applyLiveAggregatedBalances } = await import(
	"../src/internal/customers/cache/fullSubject/balances/applyLiveAggregatedBalances"
);
const { rehydrateWithLiveBalances } = await import(
	"../src/internal/customers/cache/fullSubject/actions/rehydrateWithLiveBalances"
);

type Sample = { flow: string; iter: number; phase: string; ms: number };
const samples: Sample[] = [];
const phaseOrderByFlow = new Map<string, string[]>();
const nowMs = () => performance.now();

let currentIter = 0;
let currentFlow = "";

const time = async <T>(phase: string, fn: () => Promise<T>): Promise<T> => {
	const t0 = nowMs();
	try {
		return await fn();
	} finally {
		const ms = nowMs() - t0;
		samples.push({ flow: currentFlow, iter: currentIter, phase, ms });
		const order = phaseOrderByFlow.get(currentFlow) ?? [];
		if (!order.includes(phase)) {
			order.push(phase);
			phaseOrderByFlow.set(currentFlow, order);
		}
	}
};

const quietLogger = {
	debug: () => {},
	info: () => {},
	warn: (...a: unknown[]) => console.warn(...a),
	error: (...a: unknown[]) => console.error(...a),
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
		logger: quietLogger,
	}) as unknown as Parameters<typeof getCachedFullSubject>[0]["ctx"];

const runCheckHit = async ({
	ctx,
	redisV2,
}: {
	ctx: ReturnType<typeof makeCtx>;
	redisV2: Redis;
}) => {
	currentFlow = "check-hit";

	const subjectKey = buildFullSubjectKey({
		orgId: CONFIG.orgId,
		env: CONFIG.env,
		customerId: CONFIG.customerId,
		entityId: CONFIG.entityId,
	});
	const epochKey = buildFullSubjectViewEpochKey({
		orgId: CONFIG.orgId,
		env: CONFIG.env,
		customerId: CONFIG.customerId,
	});

	const pipelineResults = await time("pipeline: subject + epoch", () =>
		redisV2
			.pipeline()
			.get(subjectKey)
			.getex(epochKey, "EX", FULL_SUBJECT_EPOCH_TTL_SECONDS)
			.set(epochKey, "0", "EX", FULL_SUBJECT_EPOCH_TTL_SECONDS, "NX")
			.exec(),
	);
	const subjectRaw = pipelineResults?.[0]?.[1] as string | null | undefined;
	if (!subjectRaw) return;

	const cached = await time("parse + sanitize", async () =>
		sanitizeCachedFullSubject({ cachedFullSubject: JSON.parse(subjectRaw) }),
	);

	const includeAggregated = !CONFIG.entityId;
	const balances = await time("hmget balances (pipelined)", () =>
		getCachedFeatureBalancesBatch({
			ctx,
			customerId: CONFIG.customerId,
			featureIds: cached.meteredFeatures,
			customerEntitlementIdsByFeatureId: cached.customerEntitlementIdsByFeatureId,
			includeAggregated,
		}),
	);
	if (balances.kind !== "ok") return;

	await time("hydrate (normalize + apply)", async () => {
		const normalized = cachedFullSubjectToNormalized({
			cached,
			customerEntitlements: balances.value.flatMap((b) => b.balances),
		});
		if (includeAggregated)
			applyLiveAggregatedBalances({
				normalized,
				featureBalances: balances.value,
			});
		return normalizedToFullSubject({ normalized });
	});
};

const runCheckMiss = async ({
	ctx,
	redisV2,
}: {
	ctx: ReturnType<typeof makeCtx>;
	redisV2: Redis;
}) => {
	currentFlow = "check-miss";
	const subjectKey = buildFullSubjectKey({
		orgId: CONFIG.orgId,
		env: CONFIG.env,
		customerId: CONFIG.customerId,
		entityId: CONFIG.entityId,
	});

	await redisV2.del(subjectKey);

	const missResult = await time(
		"getCachedFullSubject (miss — returns epoch)",
		() =>
			getCachedFullSubject({
				ctx,
				customerId: CONFIG.customerId,
				entityId: CONFIG.entityId,
				source: "bench-check-miss",
			}),
	);
	const epoch = missResult.subjectViewEpoch;

	const result = await time("getFullSubjectNormalized (DB)", () =>
		getFullSubjectNormalized({
			ctx,
			customerId: CONFIG.customerId,
			entityId: CONFIG.entityId,
		}),
	);
	if (!result) return;

	await time("setCachedFullSubject (lua)", () =>
		setCachedFullSubject({
			ctx,
			normalized: result.normalized,
			fetchedSubjectViewEpoch: epoch,
		}),
	);

	await time("rehydrateWithLiveBalances (post-set)", () =>
		rehydrateWithLiveBalances({ ctx, normalized: result.normalized }),
	);
};

const { getOrCreateCachedFullSubject } = await import(
	"../src/internal/customers/cache/fullSubject/actions/getOrCreateCachedFullSubject"
);

const runCreateCustomerHit = async ({
	ctx,
}: {
	ctx: ReturnType<typeof makeCtx>;
}) => {
	currentFlow = "createCustomer-hit";
	await time("getOrCreateCachedFullSubject (hit — same as check-hit)", () =>
		getOrCreateCachedFullSubject({
			ctx,
			params: {
				customer_id: CONFIG.customerId,
				customer_data: undefined,
				entity_id: CONFIG.entityId,
				entity_data: undefined,
			},
			source: "bench-create-hit",
		}),
	);
};

const runCreateCustomerMiss = async ({
	ctx,
	redisV2,
}: {
	ctx: ReturnType<typeof makeCtx>;
	redisV2: Redis;
}) => {
	currentFlow = "createCustomer-miss";
	const subjectKey = buildFullSubjectKey({
		orgId: CONFIG.orgId,
		env: CONFIG.env,
		customerId: CONFIG.customerId,
		entityId: CONFIG.entityId,
	});
	await redisV2.del(subjectKey);

	await time("getOrCreateCachedFullSubject (miss)", () =>
		getOrCreateCachedFullSubject({
			ctx,
			params: {
				customer_id: CONFIG.customerId,
				customer_data: undefined,
				entity_id: CONFIG.entityId,
				entity_data: undefined,
			},
			source: "bench-create-miss",
		}),
	);
};

const pct = (sorted: number[], p: number) =>
	sorted.length === 0
		? 0
		: sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

const BAR_WIDTH = 40;

const makeBar = ({ ms, scale }: { ms: number; scale: number }) => {
	const filled = Math.max(
		0,
		Math.min(BAR_WIDTH, Math.round((ms / scale) * BAR_WIDTH)),
	);
	return "█".repeat(filled) + " ".repeat(BAR_WIDTH - filled);
};

const printFlowWaterfall = ({ flow }: { flow: string }) => {
	const order = phaseOrderByFlow.get(flow);
	if (!order?.length) return;

	const phaseTimings = new Map<string, number[]>();
	const iterTotals = new Map<number, number>();
	for (const s of samples) {
		if (s.flow !== flow) continue;
		const arr = phaseTimings.get(s.phase) ?? [];
		arr.push(s.ms);
		phaseTimings.set(s.phase, arr);
		iterTotals.set(s.iter, (iterTotals.get(s.iter) ?? 0) + s.ms);
	}

	const totals = [...iterTotals.values()].sort((a, b) => a - b);
	const totalP50 = pct(totals, 50);
	const totalP95 = pct(totals, 95);
	const totalP99 = pct(totals, 99);
	const totalMax = totals[totals.length - 1] ?? 0;

	const scale =
		Math.max(...order.map((p) => pct([...(phaseTimings.get(p) ?? [])].sort((a, b) => a - b), 50))) || 1;

	console.log(
		`\n=== ${flow} (n=${CONFIG.iterations}) — waterfall (sequential; sum = request latency) ===`,
	);
	console.log(
		"phase".padEnd(48),
		"bar (p50)".padEnd(BAR_WIDTH),
		"p50".padStart(8),
		"p95".padStart(8),
		"p99".padStart(8),
		"max".padStart(8),
	);
	console.log("-".repeat(48 + BAR_WIDTH + 4 * 9));

	for (const phase of order) {
		const ms = phaseTimings.get(phase) ?? [];
		const sorted = [...ms].sort((a, b) => a - b);
		const p50 = pct(sorted, 50);
		const p95 = pct(sorted, 95);
		const p99 = pct(sorted, 99);
		const max = sorted[sorted.length - 1] ?? 0;
		console.log(
			phase.padEnd(48),
			makeBar({ ms: p50, scale }),
			p50.toFixed(2).padStart(8),
			p95.toFixed(2).padStart(8),
			p99.toFixed(2).padStart(8),
			max.toFixed(2).padStart(8),
		);
	}

	console.log("-".repeat(48 + BAR_WIDTH + 4 * 9));
	console.log(
		"TOTAL (sum of phases per iter, percentiled)".padEnd(48),
		" ".repeat(BAR_WIDTH),
		totalP50.toFixed(2).padStart(8),
		totalP95.toFixed(2).padStart(8),
		totalP99.toFixed(2).padStart(8),
		totalMax.toFixed(2).padStart(8),
	);
};

const main = async () => {
	console.log("=== V2 cache flows benchmark ===");
	console.log("config:", {
		orgId: CONFIG.orgId,
		env: CONFIG.env,
		customerId: CONFIG.customerId,
		entityId: CONFIG.entityId,
		iterations: CONFIG.iterations,
		flows: CONFIG.flows,
	});

	const { db } = initDrizzle();
	const redisV2 = resolveRedisV2();
	await warmupRedisV2();
	const ctx = makeCtx({ redisV2, db });

	const subjectKey = buildFullSubjectKey({
		orgId: CONFIG.orgId,
		env: CONFIG.env,
		customerId: CONFIG.customerId,
		entityId: CONFIG.entityId,
	});
	const existing = await redisV2.get(subjectKey);
	if (!existing) {
		console.log("\npriming cache once (cold)…");
		const epoch = await getOrInitFullSubjectViewEpoch({
			ctx,
			customerId: CONFIG.customerId,
		});
		const r = await getFullSubjectNormalized({
			ctx,
			customerId: CONFIG.customerId,
			entityId: CONFIG.entityId,
		});
		if (r)
			await setCachedFullSubject({
				ctx,
				normalized: r.normalized,
				fetchedSubjectViewEpoch: epoch,
			});
	} else {
		console.log(`\ncache already warm (${existing.length}b)`);
	}

	const raw = await redisV2.get(subjectKey);
	if (raw) {
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		const entries = Object.keys(parsed)
			.map((k) => ({
				k,
				bytes: JSON.stringify(parsed[k] ?? null).length,
			}))
			.sort((a, b) => b.bytes - a.bytes);
		const total = entries.reduce((a, e) => a + e.bytes, 0);
		console.log(`\nsubject blob: ${(total / 1024).toFixed(1)}kb total`);
		for (const e of entries.slice(0, 5)) {
			console.log(
				`  ${(e.bytes / 1024).toFixed(1).padStart(7)}kb  ${((e.bytes / total) * 100).toFixed(1).padStart(5)}%  ${e.k}`,
			);
		}
		const balanceKey = buildSharedFullSubjectBalanceKey({
			orgId: CONFIG.orgId,
			env: CONFIG.env,
			customerId: CONFIG.customerId,
			featureId:
				((parsed as { meteredFeatures?: string[] }).meteredFeatures ?? [])[0] ??
				"unknown",
		});
		console.log(`(first balance key: ${balanceKey})`);
	}

	for (let i = 1; i <= CONFIG.iterations; i++) {
		currentIter = i;
		process.stdout.write(`iter ${i}/${CONFIG.iterations}…\r`);
		if (CONFIG.flows.checkHit) await runCheckHit({ ctx, redisV2 });
		if (CONFIG.flows.checkMiss) await runCheckMiss({ ctx, redisV2 });
		if (CONFIG.flows.createCustomerHit) await runCreateCustomerHit({ ctx });
		if (CONFIG.flows.createCustomerMiss)
			await runCreateCustomerMiss({ ctx, redisV2 });
	}

	for (const flow of [
		"check-hit",
		"check-miss",
		"createCustomer-hit",
		"createCustomer-miss",
	]) {
		printFlowWaterfall({ flow });
	}

	console.log(
		"\nnote: each row is a sequential phase of the request. p50 bar is scaled to the slowest phase.",
	);
	console.log("      TOTAL is per-iter sum of phases, then percentiled.");
	process.exit(0);
};

await main();
