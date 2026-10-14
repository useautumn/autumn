import { expect, test } from "bun:test";
import { ResetInterval } from "@autumn/shared";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { sql } from "drizzle-orm";
import { resolveRedisV2 } from "@/external/redis/resolveRedisV2.js";

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

test.concurrent.skipIf(isBalanceWorkerRoute())(
	`${chalk.yellowBright("sync-coalesce: dirty key lifecycle and burst convergence (gate on)")}`,
	async () => {
		const customerId = "sync-coalesce-burst";
		const product = products.base({
			id: "coalesce-free",
			items: [items.monthlyMessages({ includedUsage: INCLUDED_USAGE })],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [product] }),
			],
			actions: [s.attach({ productId: product.id })],
		});

		const redis = resolveRedisV2();
		const keyScope = {
			orgId: ctx.org.id,
			env: ctx.env as string,
			customerId,
		};
		await redis.del(
			dirtyKey(keyScope),
			claimKey(keyScope),
			signalKey(keyScope),
		);
		const BURST = 30;
		for (let i = 0; i < BURST; i++) {
			await autumnV1.track(
				{ customer_id: customerId, feature_id: "messages", value: 1 },
				{ headers: { "x-sync-coalesce": "true" } },
			);
		}

		const dirtySeen = await pollUntil({
			fn: async () => await redis.exists(dirtyKey(keyScope)),
			predicate: (exists) => exists === 1,
			timeoutMs: 10_000,
		});
		expect(dirtySeen).toBe(1);

		const expected = INCLUDED_USAGE - BURST;
		const converged = await pollUntil({
			fn: async () => await pgBalance({ db: ctx.db, customerId }),
			predicate: (balance) => balance === expected,
			timeoutMs: 45_000,
		});
		expect(converged).toBe(expected);

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
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [product] }),
			],
			actions: [s.attach({ productId: product.id })],
		});

		await resolveRedisV2().del(
			dirtyKey({ orgId: ctx.org.id, env: ctx.env as string, customerId }),
			claimKey({ orgId: ctx.org.id, env: ctx.env as string, customerId }),
			signalKey({ orgId: ctx.org.id, env: ctx.env as string, customerId }),
		);

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
