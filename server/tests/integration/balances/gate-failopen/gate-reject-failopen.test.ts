/**
 * Trips the real FullSubject gate (tiny limits + cold cache + concurrent
 * calls) and verifies check/track fail open instead of surfacing 429s.
 */

import { afterAll, expect, mock, test } from "bun:test";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const queueCalls: Record<string, unknown>[] = [];
mock.module("@/queue/queueUtils.js", () => ({
	addTaskToQueue: async (args: Record<string, unknown>) => {
		queueCalls.push(args);
	},
}));

process.env.TRACK_SQS_QUEUE_URL ??= "https://sqs.test/gate-failopen";

const { ParsedCheckParamsSchema } = await import("@autumn/shared");
const { TestFeature } = await import("@tests/setup/v2Features.js");
const { items } = await import("@tests/utils/fixtures/items.js");
const { products } = await import("@tests/utils/fixtures/products.js");
const { initScenario, s } = await import(
	"@tests/utils/testInitUtils/initScenario.js"
);
const { createTestContext } = await import(
	"@tests/utils/testInitUtils/createTestContext.js"
);
const { runCheckWithRollout } = await import(
	"@/internal/balances/check/runCheckWithRollout.js"
);
const { runTrackWithRollout } = await import(
	"@/internal/balances/track/runTrackWithRollout.js"
);
const { invalidateCachedFullSubject } = await import(
	"@/internal/customers/cache/fullSubject/actions/invalidate/invalidateFullSubject.js"
);
const { _setFullSubjectGateConfigForTesting } = await import(
	"@/internal/misc/fullSubjectGateEdgeConfig/fullSubjectGateEdgeConfigStore.js"
);
const { primeRedisV2Monitor } = await import(
	"@/external/redis/initUtils/redisV2Availability.js"
);

// In-process runs skip server boot, which is what normally primes availability.
await primeRedisV2Monitor();

const CONCURRENCY = 8;

// Held for the whole file so test.concurrent tests can't reset it mid-flight.
_setFullSubjectGateConfigForTesting({
	config: {
		per_customer_limit: 1,
		per_org_limit: 1,
		max_wait_ms: 100,
		per_customer_pending_max: 1,
		per_org_pending_max: 1,
	},
});

afterAll(() => {
	_setFullSubjectGateConfigForTesting({ config: {} });
});

const buildContext = async ({ customerId }: { customerId: string }) => {
	const ctx = (await createTestContext()) as unknown as AutumnContext;
	ctx.rolloutSnapshot = {
		rolloutId: "v2-cache",
		enabled: true,
		percent: 100,
		previousPercent: 100,
		changedAt: 0,
		customerBucket: 0,
	};
	ctx.customerId = customerId;
	return ctx;
};

test.concurrent(
	`${chalk.yellowBright("gate-failopen: concurrent checks on cold cache never 429")}`,
	async () => {
		const customerId = "gate-failopen-check";
		const freeProd = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		const ctx = await buildContext({ customerId });
		const body = ParsedCheckParamsSchema.parse({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		await invalidateCachedFullSubject({ ctx, customerId, source: "test" });

		const results = await Promise.allSettled(
			Array.from({ length: CONCURRENCY }, () =>
				runCheckWithRollout({ ctx, body, requiredBalance: 1 }),
			),
		);

		const rejected = results.filter((result) => result.status === "rejected");
		expect(rejected).toEqual([]);

		const fulfilled = results.filter(
			(result) => result.status === "fulfilled",
		) as PromiseFulfilledResult<
			Awaited<ReturnType<typeof runCheckWithRollout>>
		>[];

		const failOpen = fulfilled.filter(
			(result) => result.value.checkData === null,
		);
		const served = fulfilled.filter(
			(result) => result.value.checkData !== null,
		);

		expect(failOpen.length).toBeGreaterThan(0);
		expect(served.length).toBeGreaterThan(0);
		for (const result of failOpen) {
			expect(result.value.response).toMatchObject({ allowed: true });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("gate-failopen: concurrent tracks on cold cache queue instead of 429")}`,
	async () => {
		const customerId = "gate-failopen-track";
		const freeProd = products.base({
			id: "free",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});

		// One ctx per call: concurrent prod tracks carry distinct request IDs,
		// and the Redis dedup treats a reused ID as a duplicate request.
		const contexts = await Promise.all(
			Array.from({ length: CONCURRENCY }, () => buildContext({ customerId })),
		);
		const [ctx] = contexts;
		const feature = ctx.features.find(
			(candidate: { id: string }) => candidate.id === TestFeature.Messages,
		);
		if (!feature) throw new Error("Messages feature missing from test org");

		await invalidateCachedFullSubject({ ctx, customerId, source: "test" });
		queueCalls.length = 0;

		const results = await Promise.allSettled(
			contexts.map((trackContext) =>
				runTrackWithRollout({
					ctx: trackContext,
					body: { customer_id: customerId, feature_id: TestFeature.Messages },
					featureDeductions: [{ feature, deduction: 1 }],
				}),
			),
		);

		const rejected = results.filter((result) => result.status === "rejected");
		expect(rejected).toEqual([]);
		expect(queueCalls.length).toBeGreaterThan(0);
	},
);
