/**
 * TDD contract test for replica-read routing of FullSubject hydrations
 * (replica-reads design §3.1: one chokepoint in getFullSubject[Normalized],
 * gated by skipCache + prober eligibility + customer_lsns freshness ledger).
 *
 * Contract under test:
 *   New types/fields:
 *     - readFrom?: "primary" | "replica-ok" (default "primary") on
 *       getFullSubject + getFullSubjectNormalized
 *     - resolveSubjectReadDb({ ctx, readFrom, orgId, env, customerId })
 *       -> { db, source: "primary" | "replica" } in server/src/db/
 *     - ctx.subjectReadTrace (non-prod debug box) -> response header
 *       x-subject-source: primary|replica|cache when the request carries
 *       x-debug-subject-source: true and NODE_ENV !== "production"
 *   New behaviors:
 *     (a) quiet customer (ledger row aged > 60s) + skipCache read
 *         -> 200, x-subject-source: replica
 *     (b) structurally written < 60s ago (create/attach marks the ledger)
 *         + skipCache read -> x-subject-source: primary (read-your-writes)
 *     (c) get_or_create of an EXISTING customer with skipCache + quiet ledger
 *         -> 200, lookup leg served by replica
 *     (d) get_or_create of a BRAND NEW customer -> creates fine (converges via
 *         primary); immediate follow-up skipCache read -> primary (create mark)
 *     (e) normal cache path untouched: read WITHOUT skipCache -> cache
 *         (primary allowed on first miss); no debug header -> no source header
 *     (f) service-level fail-safes: prober ineligible -> primary; ledger check
 *         throw -> primary; replica execute throw -> ONE primary retry succeeds
 *     (g) replica-routed hydration brands normalized + fullSubject
 *         (isReplicaSourced === true) and setCachedFullSubject throws on them
 *   Side effects:
 *     - replica hydrations run with lazy resets disabled (no primary writes)
 *     - replica-sourced subjects can never be written to Redis
 *
 * Pre-impl red: resolveSubjectReadDb / readFrom / x-subject-source do not
 * exist. Post-impl green: routing seam + debug header land per design §3.1.
 *
 * (a)-(e) run E2E against the live dev server (real primary + 2 replicas,
 * prober started in init.ts). (f)-(g) run service-level in the test process
 * because they need fake pools and forced prober states — not expressible over
 * HTTP. They are intentionally NON-concurrent: they mutate test-process module
 * state (prober probe, replica override) that must not interleave.
 */

import { expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { sql } from "drizzle-orm";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import {
	_resetReplicaRoutingStateForTesting,
	_setReplicaRoutingProbeForTesting,
} from "@/db/replicaRoutingState.js";
import {
	_setReplicaDbOverrideForTesting,
	resolveSubjectReadDb,
} from "@/db/resolveSubjectReadDb.js";
import { setCachedFullSubject } from "@/internal/customers/cache/fullSubject/actions/setCachedFullSubject/setCachedFullSubject.js";
import { isReplicaSourced } from "@/internal/customers/cache/fullSubject/subjectProvenance.js";
import { getFullSubjectNormalized } from "@/internal/customers/repos/getFullSubject/index.js";

const envBase = process.env.AUTUMN_TEST_BASE_URL;
const baseUrl = envBase
	? `${envBase.replace(/\/$/, "")}/v1`
	: "http://localhost:8080/v1";

const DEBUG_HEADERS = { "x-debug-subject-source": "true" };
const SKIP_CACHE_DEBUG_HEADERS = { ...DEBUG_HEADERS, "x-skip-cache": "true" };

/** Raw fetch (not AutumnInt) because the contract asserts response HEADERS.
 *  Pinned to V2_3 so the body is the flat ApiCustomer shape (top-level id). */
const rpcPost = async ({
	ctx,
	path,
	body,
	headers = {},
}: {
	ctx: TestContext;
	path: string;
	body: unknown;
	headers?: Record<string, string>;
}) => {
	const response = await fetch(`${baseUrl}${path}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${ctx.orgSecretKey}`,
			"Content-Type": "application/json",
			"x-api-version": ApiVersion.V2_3,
			...headers,
		},
		body: JSON.stringify(body),
	});
	const json = (await response.json()) as { id?: string };
	return {
		status: response.status,
		json,
		customerId: json.id,
		subjectSource: response.headers.get("x-subject-source"),
	};
};

/** DML on test-owned ledger rows only: makes the customer "quiet" (> 60s). */
const preAgeLedger = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	await ctx.db.execute(sql`
		UPDATE customer_lsns
		SET updated_at = now() - interval '2 minutes'
		WHERE org_id = ${ctx.org.id}
			AND env = ${ctx.env}
			AND customer_id = ${customerId}
	`);
};

/** Dev replicas run ~0 lag; this bounds the created-row catch-up window. */
const REPLICA_CATCHUP_MS = 1_500;

// ── Contract assertion (a): quiet customer + skipCache -> replica ──────────
test.concurrent(
	`${chalk.yellowBright("replica-reads (a): quiet customer + skipCache read is served by the replica")}`,
	async () => {
		const customerId = "replica-read-quiet-customer";
		const { ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await timeout(REPLICA_CATCHUP_MS);
		await preAgeLedger({ ctx, customerId });

		const res = await rpcPost({
			ctx,
			path: "/customers.get",
			body: { customer_id: customerId },
			headers: SKIP_CACHE_DEBUG_HEADERS,
		});

		expect(res.status).toBe(200);
		expect(res.customerId).toBe(customerId);
		expect(res.subjectSource).toBe("replica");
	},
);

// ── Contract assertion (b): structural write < 60s ago -> primary ──────────
test.concurrent(
	`${chalk.yellowBright("replica-reads (b): freshly attached customer + skipCache read pins primary (read-your-writes)")}`,
	async () => {
		const customerId = "replica-read-fresh-write-customer";
		const pro = products.pro({
			id: "replica-read-pro-b",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		// Attach just marked the customer_lsns ledger; no pre-aging here.
		const res = await rpcPost({
			ctx,
			path: "/customers.get",
			body: { customer_id: customerId },
			headers: SKIP_CACHE_DEBUG_HEADERS,
		});

		expect(res.status).toBe(200);
		expect(res.customerId).toBe(customerId);
		expect(res.subjectSource).toBe("primary");
	},
);

// ── Contract assertion (c): get_or_create existing + quiet -> replica ──────
test.concurrent(
	`${chalk.yellowBright("replica-reads (c): get_or_create of an existing quiet customer serves the lookup from the replica")}`,
	async () => {
		const customerId = "replica-read-goc-existing";
		const { ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		await timeout(REPLICA_CATCHUP_MS);
		await preAgeLedger({ ctx, customerId });

		const res = await rpcPost({
			ctx,
			path: "/customers.get_or_create",
			body: { customer_id: customerId },
			headers: SKIP_CACHE_DEBUG_HEADERS,
		});

		expect(res.status).toBe(200);
		expect(res.customerId).toBe(customerId);
		expect(res.subjectSource).toBe("replica");
	},
);

// ── Contract assertion (d): get_or_create brand-new -> converges, then primary
test.concurrent(
	`${chalk.yellowBright("replica-reads (d): get_or_create of a brand-new customer creates via primary; follow-up read pins primary")}`,
	async () => {
		const customerId = "replica-read-goc-brand-new";
		const { ctx, autumnV1 } = await initScenario({
			setup: [],
			actions: [],
		});
		// Deterministic id across runs: remove any prior copy so this run truly
		// creates. A delete is itself a structural write and marks the ledger,
		// which only reinforces the primary-pinned expectation below.
		await autumnV1.customers.delete(customerId).catch(() => undefined);

		const created = await rpcPost({
			ctx,
			path: "/customers.get_or_create",
			body: { customer_id: customerId },
			headers: SKIP_CACHE_DEBUG_HEADERS,
		});
		expect(created.status).toBe(200);
		expect(created.customerId).toBe(customerId);

		const followUp = await rpcPost({
			ctx,
			path: "/customers.get",
			body: { customer_id: customerId },
			headers: SKIP_CACHE_DEBUG_HEADERS,
		});
		expect(followUp.status).toBe(200);
		expect(followUp.customerId).toBe(customerId);
		expect(followUp.subjectSource).toBe("primary");
	},
);

// ── Contract assertion (e): normal cache path untouched ────────────────────
test.concurrent(
	`${chalk.yellowBright("replica-reads (e): reads without skipCache stay on the cache path and emit no header without the debug opt-in")}`,
	async () => {
		const customerId = "replica-read-cache-path";
		const { ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false })],
			actions: [],
		});

		const first = await rpcPost({
			ctx,
			path: "/customers.get",
			body: { customer_id: customerId },
			headers: DEBUG_HEADERS,
		});
		expect(first.status).toBe(200);
		expect(first.customerId).toBe(customerId);
		// First read may miss (primary hydration + cache fill) or hit a cache
		// warmed by the create flow — both are today's behavior.
		expect(["cache", "primary"]).toContain(first.subjectSource ?? "missing");

		// Outlive the in-process L1 TTL so the second read exercises Redis.
		await timeout(1_200);
		const second = await rpcPost({
			ctx,
			path: "/customers.get",
			body: { customer_id: customerId },
			headers: DEBUG_HEADERS,
		});
		expect(second.status).toBe(200);
		expect(second.customerId).toBe(customerId);
		expect(second.subjectSource).toBe("cache");

		// Without the debug opt-in the header must never appear (prod shape).
		const noDebug = await rpcPost({
			ctx,
			path: "/customers.get",
			body: { customer_id: customerId },
		});
		expect(noDebug.status).toBe(200);
		expect(noDebug.customerId).toBe(customerId);
		expect(noDebug.subjectSource).toBeNull();
	},
);

// ── Contract assertion (f): service-level fail-safes (NOT concurrent) ──────
test(`${chalk.yellowBright("replica-reads (f): resolveSubjectReadDb fail-safes and one-shot primary retry on replica failure")}`, async () => {
	const customerId = "replica-read-service-failsafe";
	const { ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false })],
		actions: [],
	});
	const skipCacheCtx = { ...ctx, skipCache: true };
	const baseArgs = { orgId: ctx.org.id, env: ctx.env, customerId };

	try {
		// (f1) prober ineligible (never probed -> stale) -> primary.
		_resetReplicaRoutingStateForTesting();
		const ineligible = await resolveSubjectReadDb({
			ctx: skipCacheCtx,
			readFrom: "replica-ok",
			...baseArgs,
		});
		expect(ineligible.source).toBe("primary");
		expect(ineligible.db).toBe(ctx.db);

		// Sanity for the gates below: eligible prober + quiet ledger -> replica.
		_setReplicaRoutingProbeForTesting({ replicaCount: 2, maxReplayLagMs: 0 });
		await preAgeLedger({ ctx, customerId });
		const eligible = await resolveSubjectReadDb({
			ctx: skipCacheCtx,
			readFrom: "replica-ok",
			...baseArgs,
		});
		expect(eligible.source).toBe("replica");

		// Default readFrom and non-skipCache contexts always pin primary.
		const explicitPrimary = await resolveSubjectReadDb({
			ctx: skipCacheCtx,
			readFrom: "primary",
			...baseArgs,
		});
		expect(explicitPrimary.source).toBe("primary");
		const cachePathCtx = await resolveSubjectReadDb({
			ctx,
			readFrom: "replica-ok",
			...baseArgs,
		});
		expect(cachePathCtx.source).toBe("primary");

		// (f2) ledger check throws -> primary (fail-safe).
		const throwingLedgerDb = {
			execute: () => Promise.reject(new Error("ledger unavailable")),
		} as unknown as DrizzleCli;
		const ledgerError = await resolveSubjectReadDb({
			ctx: { ...skipCacheCtx, dbGeneral: throwingLedgerDb },
			readFrom: "replica-ok",
			...baseArgs,
		});
		expect(ledgerError.source).toBe("primary");

		// (f3) replica execute throws -> exactly one primary retry returns data.
		const brokenReplicaDb = {
			$client: {
				query: () => Promise.reject(new Error("replica exploded")),
			},
			execute: () => Promise.reject(new Error("replica exploded")),
		} as unknown as DrizzleCli;
		_setReplicaDbOverrideForTesting(brokenReplicaDb);
		const result = await getFullSubjectNormalized({
			ctx: skipCacheCtx,
			customerId,
			readFrom: "replica-ok",
		});
		expect(result).toBeDefined();
		expect(result?.fullSubject.customer.id).toBe(customerId);
		// Primary-fallback data must NOT carry the replica brand.
		expect(isReplicaSourced(result?.normalized as object)).toBe(false);
		expect(isReplicaSourced(result?.fullSubject as object)).toBe(false);
	} finally {
		_setReplicaDbOverrideForTesting(null);
		_resetReplicaRoutingStateForTesting();
	}
});

// ── Contract assertion (g): provenance brand + cache-writer lock (NOT concurrent)
test(`${chalk.yellowBright("replica-reads (g): replica-sourced subjects are branded and rejected by setCachedFullSubject")}`, async () => {
	const customerId = "replica-read-provenance";
	const { ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false })],
		actions: [],
	});

	await timeout(REPLICA_CATCHUP_MS);
	await preAgeLedger({ ctx, customerId });
	_setReplicaRoutingProbeForTesting({ replicaCount: 2, maxReplayLagMs: 0 });

	try {
		const result = await getFullSubjectNormalized({
			ctx: { ...ctx, skipCache: true },
			customerId,
			readFrom: "replica-ok",
		});
		expect(result).toBeDefined();
		if (!result) throw new Error("expected a replica-routed hydration");

		expect(isReplicaSourced(result.normalized)).toBe(true);
		expect(isReplicaSourced(result.fullSubject)).toBe(true);

		await expect(
			setCachedFullSubject({
				ctx,
				normalized: result.normalized,
				fetchedSubjectViewEpoch: 0,
			}),
		).rejects.toThrow(/replica-sourced/);
	} finally {
		_resetReplicaRoutingStateForTesting();
	}
});
