/**
 * TDD contract test for sync-v4 coalescing: per-customer Redis dirty state
 * replaces full-payload SyncBalanceBatchV4 messages; SQS carries only a
 * "customer X is dirty" signal, enqueued on the empty->dirty transition.
 *
 * Contract under test:
 *   New types/fields:
 *     - Redis keys on the v2-cache instance:
 *         sync:dirty:{orgId}:{env}:{customerId}   (merged selectors + usage-window snapshots)
 *         sync:claim:{orgId}:{env}:{customerId}   (exists only during a drain)
 *         sync:signal:{orgId}:{env}:{customerId}  (TTL marker: signal outstanding)
 *     - gate: miscellaneousEdgeConfig.syncCoalesce (global switch, dark by
 *       default); tests enable per request via the x-sync-coalesce header
 *       (ctx.testOptions.syncCoalesce, non-prod only)
 *   New behaviors:
 *     - gate ON:  track -> dirty key appears; after drain: dirty+claim+signal keys
 *                 gone and Postgres balance equals Redis balance
 *     - gate ON:  burst of N tracks -> Postgres balance exact (no lost writes,
 *                 no double-applies) despite signal collapse
 *     - gate ON:  usage-window customer -> usage_windows table holds the LATEST
 *                 counter snapshot after drain (last-write-wins per feature)
 *   Side effects (unchanged):
 *     - customer_entitlements balance converges to Redis state
 *
 * Pre-impl red: every gate-ON assertion fails because no code writes
 * sync:dirty:* keys (feature does not exist).
 * Post-impl green: all assertions pass once the dirty-state producer
 * (SyncBatchingManagerV3 flush target) + SyncCustomerDirty drain handler land.
 */

import { expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import chalk from "chalk";
import { sql } from "drizzle-orm";
import { resolveRedisV2 } from "@/external/redis/resolveRedisV2.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";

const INCLUDED_USAGE = 1_000_000;

const dirtyKey = ({
	orgId,
	env,
	customerId,
}: {
	orgId: string;
	env: string;
	customerId: string;
}) => `sync:dirty:${orgId}:${env}:${customerId}`;

const claimKey = ({
	orgId,
	env,
	customerId,
}: {
	orgId: string;
	env: string;
	customerId: string;
}) => `sync:claim:${orgId}:${env}:${customerId}`;

const signalKey = ({
	orgId,
	env,
	customerId,
}: {
	orgId: string;
	env: string;
	customerId: string;
}) => `sync:signal:${orgId}:${env}:${customerId}`;

const pollUntil = async <T>({
	fn,
	predicate,
	timeoutMs = 30_000,
	intervalMs = 500,
}: {
	fn: () => Promise<T>;
	predicate: (value: T) => boolean;
	timeoutMs?: number;
	intervalMs?: number;
}): Promise<T> => {
	const startedAt = Date.now();
	let last: T = await fn();
	while (!predicate(last) && Date.now() - startedAt < timeoutMs) {
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
		last = await fn();
	}
	return last;
};

const pgBalance = async ({
	db,
	customerId,
}: {
	db: any;
	customerId: string;
}): Promise<number | null> => {
	const rows = await db.execute(
		sql`SELECT ce.balance
		    FROM customer_entitlements ce
		    JOIN customers c ON c.internal_id = ce.internal_customer_id
		    JOIN features f ON f.internal_id = ce.internal_feature_id
		    WHERE c.id = ${customerId} AND f.id = 'messages'
		    ORDER BY ce.created_at DESC LIMIT 1`,
	);
	const row = rows[0] as { balance: number | string } | undefined;
	return row ? Number(row.balance) : null;
};

// ── Contract 1+2: gate ON — dirty key lifecycle + exact burst convergence ──
test.concurrent(
	`${chalk.yellowBright("sync-coalesce: dirty key lifecycle and burst convergence (gate on)")}`,
	async () => {
		const customerId = "sync-coalesce-burst";
		const product = products.base({
			id: "coalesce-free",
			items: [items.monthlyMessages({ includedUsage: INCLUDED_USAGE })],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [product] })],
			actions: [s.attach({ productId: product.id })],
		});

		const redis = resolveRedisV2();
		const keyScope = {
			orgId: ctx.org.id,
			env: ctx.env as string,
			customerId,
		};
		// Deterministic customer ids: clear coalescing keys left by prior runs.
		await redis.del(
			dirtyKey(keyScope),
			claimKey(keyScope),
			signalKey(keyScope),
		);
		// Burst: 30 tracks with the gate enabled per request via testOptions.
		const BURST = 30;
		for (let i = 0; i < BURST; i++) {
			await autumnV1.track(
				{ customer_id: customerId, feature_id: "messages", value: 1 },
				{ headers: { "x-sync-coalesce": "true" } },
			);
		}

		// ── Assertion: dirty key appears while writes are in flight ──────
		// Pre-impl: never appears (no producer writes it) -> red.
		const dirtySeen = await pollUntil({
			fn: async () => await redis.exists(dirtyKey(keyScope)),
			predicate: (exists) => exists === 1,
			timeoutMs: 10_000,
		});
		expect(dirtySeen).toBe(1);

		// ── Assertion: after drain, Postgres balance is exact ────────────
		const expected = INCLUDED_USAGE - BURST;
		const converged = await pollUntil({
			fn: async () => await pgBalance({ db: ctx.db, customerId }),
			predicate: (balance) => balance === expected,
			timeoutMs: 45_000,
		});
		expect(converged).toBe(expected);

		// ── Assertion: coalescing keys are cleaned up after drain ────────
		const leftovers = await pollUntil({
			fn: async () =>
				(await redis.exists(dirtyKey(keyScope))) +
				(await redis.exists(claimKey(keyScope))),
			predicate: (count) => count === 0,
			timeoutMs: 30_000,
		});
		expect(leftovers).toBe(0);
	},
);

// ── Contract 3: gate ON — usage-window snapshots land last-write-wins ──
test.concurrent(
	`${chalk.yellowBright("sync-coalesce: usage-window latest snapshot lands (gate on)")}`,
	async () => {
		const customerId = "sync-coalesce-uw";
		const product = products.base({
			id: "coalesce-uw-free",
			items: [items.monthlyMessages({ includedUsage: INCLUDED_USAGE })],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [product] })],
			actions: [s.attach({ productId: product.id })],
		});

		// Deterministic customer ids: clear coalescing keys left by prior runs.
		await resolveRedisV2().del(
			dirtyKey({ orgId: ctx.org.id, env: ctx.env as string, customerId }),
			claimKey({ orgId: ctx.org.id, env: ctx.env as string, customerId }),
			signalKey({ orgId: ctx.org.id, env: ctx.env as string, customerId }),
		);

		// Windowed usage cap -> every deduction carries a counter snapshot.
		await autumnV1.customers.update(customerId, {
			billing_controls: {
				usage_limits: [
					{
						feature_id: "messages",
						enabled: true,
						limit: INCLUDED_USAGE,
						interval: ResetInterval.Day,
					},
				],
			},
		});

		const BURST = 20;
		for (let i = 0; i < BURST; i++) {
			await autumnV1.track(
				{ customer_id: customerId, feature_id: "messages", value: 1 },
				{ headers: { "x-sync-coalesce": "true" } },
			);
		}

		// ── Assertion: usage_windows row reflects the FINAL counter ──────
		// (last-write-wins: an older snapshot overwriting a newer one would
		// show usage < BURST here)
		const usage = await pollUntil({
			fn: async () => {
				const rows = await ctx.db.execute(
					sql`SELECT uw.usage
					    FROM usage_windows uw
					    JOIN customers c ON c.internal_id = uw.internal_customer_id
					    WHERE c.id = ${customerId} AND uw.feature_id = 'messages'
					    ORDER BY uw.updated_at DESC LIMIT 1`,
				);
				const row = rows[0] as { usage: number | string } | undefined;
				return row ? Number(row.usage) : null;
			},
			predicate: (value) => value === BURST,
			timeoutMs: 45_000,
		});
		expect(usage).toBe(BURST);
	},
);
