import { expect, test } from "bun:test";
import type { ApiCustomerV5 } from "@autumn/shared";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import {
	cleanupOrgRollout,
	serverRoutesByRolloutConfig,
	setOrgRolloutPercent,
} from "@tests/utils/rolloutTestUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildFullSubjectKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectKey.js";

const testCase = "rollout-track-transition";
// Redis syncs to Postgres within a few seconds; the flip must see that landed.
const SYNC_LAG_MS = 3_000;

/** The Redis view's load time, or null when no view exists: the trace of which lane served the customer. */
const readViewCachedAt = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}): Promise<number | null> => {
	const raw = await ctx.redisV2.get(
		buildFullSubjectKey({ orgId: ctx.org.id, env: ctx.env, customerId }),
	);
	if (!raw) return null;
	return (JSON.parse(raw) as { _cachedAt: number })._cachedAt;
};

// Needs the local server on BALANCE_WORKER_ROLLOUT_ENABLED=config: the override would ignore the percent.
test.skipIf(!serverRoutesByRolloutConfig())(
	`${chalk.yellowBright(`${testCase}: track across Redis → worker → Redis`)}`,
	async () => {
		const monthlyMessages = items.monthlyMessages({ includedUsage: 100 });
		const freeProd = products.base({ id: "free", items: [monthlyMessages] });
		const customerId = `${testCase}`;

		const { autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [freeProd] }),
			],
			actions: [s.attach({ productId: freeProd.id })],
		});
		const orgId = ctx.org.id;

		const trackTen = () =>
			autumnV2_2.track({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
				value: 10,
			});
		const expectRemaining = async (remaining: number) => {
			const customer =
				await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
			expectBalanceCorrect({
				customer,
				featureId: TestFeature.Messages,
				remaining,
			});
		};

		try {
			// Phase 1, Redis: the track builds a view and syncs to Postgres.
			await setOrgRolloutPercent({ orgId, percent: 0 });
			await trackTen();
			await timeout(SYNC_LAG_MS);
			await expectRemaining(90);
			const cachedAtOnRedis = await readViewCachedAt({ ctx, customerId });
			expect(cachedAtOnRedis).not.toBeNull();

			// Phase 2, worker: the view is never read or rebuilt; the balance comes from the worker.
			await setOrgRolloutPercent({ orgId, percent: 100 });
			await trackTen();
			await expectRemaining(80);
			expect(await readViewCachedAt({ ctx, customerId })).toBe(cachedAtOnRedis);

			// Phase 3, Redis again: the pre-flip view is evicted on first read and rebuilt from Postgres.
			await setOrgRolloutPercent({ orgId, percent: 0 });
			await trackTen();
			await timeout(SYNC_LAG_MS);
			await expectRemaining(70);
			const cachedAtAfterRollback = await readViewCachedAt({ ctx, customerId });
			expect(cachedAtAfterRollback).not.toBeNull();
			expect(cachedAtAfterRollback).toBeGreaterThan(cachedAtOnRedis ?? 0);
		} finally {
			await cleanupOrgRollout({ orgId });
		}
	},
	{ timeout: 120_000 },
);
