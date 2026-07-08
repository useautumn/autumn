/**
 * Benchmark: current create/delete sub-account lifecycle vs the persistent pool
 * (claim + async nuke). Real Stripe sandbox accounts, round-robined across the
 * key pool exactly like a run. Results feed scripts/tw/STRIPE_POOL_BENCH.md.
 *
 * Run: infisical run --env=dev --recursive -- bun scripts/tw/bench/stripePoolBench.ts [N]
 */

import { appendFileSync } from "node:fs";
import pLimit from "p-limit";
// @ts-expect-error plain-JS module shared with the sandbox nuke script
import {
	nukeTarget,
	rateLimitIncidents,
	setPoolState,
} from "../image/nuke-accounts.mjs";
import { createSandboxSubAccount } from "../helpers/stripe.js";
import {
	decodeSubAccount,
	encodeSubAccount,
	stripeClientForKey,
	stripeKeyByIndex,
	stripeKeyForWorker,
} from "../helpers/stripeKeyPool.js";

const N = Number(process.argv[2]) || 50;
const TEARDOWN_CONCURRENCY = 16;
const RESULTS_PATH = "/tmp/tw_pool_bench_results.json";
const PROGRESS_PATH = "/tmp/tw_pool_bench_progress.log";

const progress = (line: string): void => {
	const stamped = `[${new Date().toISOString()}] ${line}`;
	console.log(stamped);
	appendFileSync(PROGRESS_PATH, `${stamped}\n`);
};

type Timed = { totalMs: number; perItemMs: number[] };

const stats = (ms: number[]): { avg: number; p50: number; p95: number; max: number } => {
	const sorted = [...ms].sort((a, b) => a - b);
	const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
	return {
		avg: Math.round(ms.reduce((a, b) => a + b, 0) / (ms.length || 1)),
		p50: at(0.5),
		p95: at(0.95),
		max: sorted.at(-1) ?? 0,
	};
};

const timedAll = async <T>(
	items: T[],
	concurrency: number,
	fn: (item: T, idx: number) => Promise<void>,
): Promise<Timed> => {
	const limit = pLimit(concurrency);
	const perItemMs: number[] = new Array(items.length).fill(0);
	const start = Date.now();
	await Promise.all(
		items.map((item, idx) =>
			limit(async () => {
				const t0 = Date.now();
				await fn(item, idx);
				perItemMs[idx] = Date.now() - t0;
			}),
		),
	);
	return { totalMs: Date.now() - start, perItemMs };
};

/** Seed a used-account shape: 1 customer, 1 product, 1 price, 1 coupon.
 * (Webhook endpoints cannot be created ON a connected account — runs use the
 * platform Connect webhook via the ingress instead.) */
const seedAccount = async (encoded: string): Promise<void> => {
	const { accountId, keyIndex } = decodeSubAccount(encoded);
	const stripe = stripeClientForKey(stripeKeyByIndex(keyIndex));
	const scoped = { stripeAccount: accountId } as const;
	const customer = await stripe.customers.create(
		{ email: "bench@useautumn.com", name: "pool-bench" },
		scoped,
	);
	const product = await stripe.products.create({ name: "pool-bench-product" }, scoped);
	await stripe.prices.create(
		{
			product: product.id,
			unit_amount: 1000,
			currency: "usd",
			recurring: { interval: "month" },
		},
		scoped,
	);
	await stripe.coupons.create(
		{ percent_off: 10, duration: "once", name: "pool-bench-coupon" },
		scoped,
	);
	void customer;
};

const main = async (): Promise<void> => {
	progress(`pool bench: N=${N}, teardown concurrency=${TEARDOWN_CONCURRENCY}`);
	const owner = "pool-bench";
	const runId = `bench-${Date.now().toString(36)}`;
	const indices = Array.from({ length: N }, (_, i) => i);
	const encoded: string[] = new Array(N);

	// ---- Phase A1: CREATE (the current fan-out cost) --------------------------
	let warns = 0;
	const origWarn = console.warn;
	console.warn = (...args: unknown[]) => {
		if (String(args[0]).includes("rate-limited")) {
			warns++;
		}
		origWarn(...args);
	};
	progress("phase A1: creating accounts (current fan-out path, real pacing)…");
	const createTimed = await timedAll(indices, N, async (idx) => {
		const { key, keyIndex } = stripeKeyForWorker(idx);
		const accountId = await createSandboxSubAccount({
			orgName: `pool-bench (${idx})`,
			ownerEmail: "bench@useautumn.com",
			owner,
			runId,
			orgId: "org_bench",
			secretKey: key,
		});
		encoded[idx] = encodeSubAccount(accountId, keyIndex);
	});
	console.warn = origWarn;
	progress(`create done: total ${createTimed.totalMs}ms, 429 retries: ${warns}`);

	// ---- Seed: make the accounts genuinely dirty ------------------------------
	progress("seeding accounts (customer+product+price+coupon each)…");
	const seedTimed = await timedAll(encoded, TEARDOWN_CONCURRENCY, seedAccount);
	progress(`seed done: total ${seedTimed.totalMs}ms`);

	// ---- Phase B1: CLAIM cost (list clean + mark dirty) -----------------------
	// Mark clean first so the claim path has something to find.
	progress("marking accounts clean (pool metadata)…");
	const markCleanTimed = await timedAll(encoded, TEARDOWN_CONCURRENCY, async (item) => {
		const { accountId, keyIndex } = decodeSubAccount(item);
		await setPoolState({
			accountId,
			key: stripeKeyByIndex(keyIndex),
			state: "clean",
			extra: { autumn_tw_pool: "1" },
		});
	});
	progress(`mark-clean done: total ${markCleanTimed.totalMs}ms`);

	progress("phase B1: claim (list pool + mark dirty)…");
	const listStart = Date.now();
	const usedKeyIndices = [...new Set(indices.map((i) => stripeKeyForWorker(i).keyIndex))];
	const found: string[] = [];
	await Promise.all(
		usedKeyIndices.map(async (keyIndex) => {
			const stripe = stripeClientForKey(stripeKeyByIndex(keyIndex));
			for await (const account of stripe.accounts.list({ limit: 100 })) {
				const metadata = account.metadata as Record<string, string> | null;
				if (
					metadata?.autumn_tw_pool === "1" &&
					metadata?.autumn_tw_pool_state === "clean" &&
					metadata?.autumn_tw_owner === owner
				) {
					found.push(encodeSubAccount(account.id, keyIndex));
				}
			}
		}),
	);
	const listMs = Date.now() - listStart;
	progress(`claim list done: found ${found.length}/${N} clean in ${listMs}ms`);

	const markDirtyTimed = await timedAll(encoded, TEARDOWN_CONCURRENCY, async (item) => {
		const { accountId, keyIndex } = decodeSubAccount(item);
		await setPoolState({
			accountId,
			key: stripeKeyByIndex(keyIndex),
			state: "dirty",
			extra: { autumn_tw_run: runId },
		});
	});
	progress(`mark-dirty done: total ${markDirtyTimed.totalMs}ms`);

	// ---- Phase B2: NUKE (what the async sandbox pays) -------------------------
	progress("phase B2: nuking account contents…");
	const nukeCounts: Record<string, number>[] = [];
	const nukeTimed = await timedAll(encoded, TEARDOWN_CONCURRENCY, async (item) => {
		const { accountId, keyIndex } = decodeSubAccount(item);
		const { counts } = await nukeTarget({ accountId, key: stripeKeyByIndex(keyIndex) });
		nukeCounts.push(counts);
	});
	progress(
		`nuke done: total ${nukeTimed.totalMs}ms, 429s so far: ${rateLimitIncidents.count}`,
	);

	// ---- Verify one nuked account is actually empty ---------------------------
	const probe = decodeSubAccount(encoded[0]);
	const probeStripe = stripeClientForKey(stripeKeyByIndex(probe.keyIndex));
	const scoped = { stripeAccount: probe.accountId } as const;
	const [customers, products, coupons] = await Promise.all([
		probeStripe.customers.list({ limit: 10 }, scoped),
		probeStripe.products.list({ limit: 10, active: true }, scoped),
		probeStripe.coupons.list({ limit: 10 }, scoped),
	]);
	progress(
		`post-nuke probe ${probe.accountId}: customers=${customers.data.length} activeProducts=${products.data.length} coupons=${coupons.data.length}`,
	);

	// ---- Phase A2: DELETE (the current teardown block) ------------------------
	progress("phase A2: deleting accounts (current teardown path)…");
	const deleteTimed = await timedAll(encoded, TEARDOWN_CONCURRENCY, async (item) => {
		const { accountId, keyIndex } = decodeSubAccount(item);
		await stripeClientForKey(stripeKeyByIndex(keyIndex)).accounts.del(accountId);
	});
	progress(`delete done: total ${deleteTimed.totalMs}ms`);

	const results = {
		n: N,
		keyPoolUsed: usedKeyIndices.length,
		create: { totalMs: createTimed.totalMs, ...stats(createTimed.perItemMs), rateLimit429Retries: warns },
		seed: { totalMs: seedTimed.totalMs, ...stats(seedTimed.perItemMs) },
		claimListMs: listMs,
		markDirty: { totalMs: markDirtyTimed.totalMs, ...stats(markDirtyTimed.perItemMs) },
		nuke: { totalMs: nukeTimed.totalMs, ...stats(nukeTimed.perItemMs), rateLimit429s: rateLimitIncidents.count },
		nukeCountsSample: nukeCounts.slice(0, 3),
		delete: { totalMs: deleteTimed.totalMs, ...stats(deleteTimed.perItemMs) },
	};
	await Bun.write(RESULTS_PATH, JSON.stringify(results, null, 2));
	progress(`results written to ${RESULTS_PATH}`);
};

await main();
