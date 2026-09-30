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
	setCustomerRolloutPinned,
	setOrgRolloutPercent,
} from "@tests/utils/rolloutTestUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { buildFullSubjectKey } from "@/internal/customers/cache/fullSubject/builders/buildFullSubjectKey.js";

const testCase = "rollout-customer-pin";
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

const setupPinScenario = async ({ customerId }: { customerId: string }) => {
	const monthlyMessages = items.monthlyMessages({ includedUsage: 100 });
	const freeProd = products.base({ id: "free", items: [monthlyMessages] });
	const { autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [freeProd] })],
		actions: [s.attach({ productId: freeProd.id })],
	});

	const trackTen = () =>
		autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 10,
		});
	const expectRemaining = async (remaining: number) => {
		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectBalanceCorrect({
			customer,
			featureId: TestFeature.Messages,
			remaining,
		});
	};

	return { ctx, orgId: ctx.org.id, trackTen, expectRemaining };
};

// Needs the local server on BALANCE_WORKER_ROLLOUT_ENABLED=config: the override would ignore the pin.
test.skipIf(!serverRoutesByRolloutConfig())(
	`${chalk.yellowBright(`${testCase}: pin, unpin and re-pin a customer, org at 0%`)}`,
	async () => {
		const customerId = `${testCase}`;
		const { ctx, orgId, trackTen, expectRemaining } = await setupPinScenario({
			customerId,
		});

		try {
			// Phase 1, Redis: the org is at 0% and the customer is not pinned.
			await setOrgRolloutPercent({ orgId, percent: 0 });
			await trackTen();
			await timeout(SYNC_LAG_MS);
			await expectRemaining(90);
			const cachedAtOnRedis = await readViewCachedAt({ ctx, customerId });
			expect(cachedAtOnRedis).not.toBeNull();

			// Phase 2, pinned: the worker serves the customer and the view is left alone.
			await setCustomerRolloutPinned({ ctx, customerId, pinned: true });
			await trackTen();
			await expectRemaining(80);
			expect(await readViewCachedAt({ ctx, customerId })).toBe(cachedAtOnRedis);

			// Phase 3, unpinned: back on Redis, the pre-pin view is evicted and rebuilt from Postgres.
			await setCustomerRolloutPinned({ ctx, customerId, pinned: false });
			await trackTen();
			await timeout(SYNC_LAG_MS);
			await expectRemaining(70);
			const cachedAtAfterUnpin = await readViewCachedAt({ ctx, customerId });
			expect(cachedAtAfterUnpin).not.toBeNull();
			expect(cachedAtAfterUnpin).toBeGreaterThan(cachedAtOnRedis ?? 0);

			// Phase 4, still unpinned: the rebuilt view is kept, not evicted again.
			await trackTen();
			await timeout(SYNC_LAG_MS);
			await expectRemaining(60);
			expect(await readViewCachedAt({ ctx, customerId })).toBe(
				cachedAtAfterUnpin,
			);

			// Phase 5, re-pinned: the worker drops its phase-2 copy and sees the Redis-era tracks.
			await setCustomerRolloutPinned({ ctx, customerId, pinned: true });
			await trackTen();
			await expectRemaining(50);
		} finally {
			await setCustomerRolloutPinned({ ctx, customerId, pinned: false });
			await cleanupOrgRollout({ orgId });
		}
	},
	{ timeout: 180_000 },
);

// With no pre-pin view, unpinning evicts nothing: only the evict on re-pin drops the worker's first-stint copy.
test.skipIf(!serverRoutesByRolloutConfig())(
	`${chalk.yellowBright(`${testCase}: re-pin after the Redis view expired`)}`,
	async () => {
		const customerId = `${testCase}-expired-view`;
		const { ctx, orgId, trackTen, expectRemaining } = await setupPinScenario({
			customerId,
		});

		try {
			await setOrgRolloutPercent({ orgId, percent: 0 });
			await ctx.redisV2.del(
				buildFullSubjectKey({ orgId, env: ctx.env, customerId }),
			);

			await setCustomerRolloutPinned({ ctx, customerId, pinned: true });
			await trackTen();
			await expectRemaining(90);
			await timeout(SYNC_LAG_MS);

			await setCustomerRolloutPinned({ ctx, customerId, pinned: false });
			await trackTen();
			await timeout(SYNC_LAG_MS);
			await expectRemaining(80);

			await setCustomerRolloutPinned({ ctx, customerId, pinned: true });
			await trackTen();
			await expectRemaining(70);
		} finally {
			await setCustomerRolloutPinned({ ctx, customerId, pinned: false });
			await cleanupOrgRollout({ orgId });
		}
	},
	{ timeout: 180_000 },
);
