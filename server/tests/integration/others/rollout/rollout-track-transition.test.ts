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
const SYNC_LAG_MS = 3_000;

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
			await setOrgRolloutPercent({ orgId, percent: 0 });
			await trackTen();
			await timeout(SYNC_LAG_MS);
			await expectRemaining(90);
			const cachedAtOnRedis = await readViewCachedAt({ ctx, customerId });
			expect(cachedAtOnRedis).not.toBeNull();

			await setOrgRolloutPercent({ orgId, percent: 100 });
			await trackTen();
			await expectRemaining(80);
			expect(await readViewCachedAt({ ctx, customerId })).toBe(cachedAtOnRedis);

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
