import { expect, test } from "bun:test";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { getCtxWithCustomerRedis } from "@/external/redis/customerRedisRouting.js";
import { buildSharedFullSubjectBalanceKey } from "@/internal/customers/cache/fullSubject/builders/buildSharedFullSubjectBalanceKey.js";
import { AGGREGATED_BALANCE_FIELD } from "@/internal/customers/cache/fullSubject/config/fullSubjectCacheConfig.js";
import { runBatchResetV2 } from "./batchResetV2TestUtils.js";

const INCLUDED_USAGE = 100;

const initWarmedCacheScenario = async ({
	customerId,
	planId,
}: {
	customerId: string;
	planId: string;
}) => {
	const plan = products.base({
		id: planId,
		items: [items.monthlyMessages({ includedUsage: INCLUDED_USAGE })],
	});

	const { ctx, autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});

	const customerEntitlement = await findCustomerEntitlement({
		ctx,
		customerId,
		featureId: TestFeature.Messages,
	});
	expect(customerEntitlement).toBeDefined();

	await autumnV2_2.check({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});

	const balanceKey = buildSharedFullSubjectBalanceKey({
		orgId: ctx.org.id,
		env: ctx.env,
		customerId,
		featureId: TestFeature.Messages,
	});
	const { ctx: routedCtx } = getCtxWithCustomerRedis({ ctx, customerId });

	return {
		ctx,
		customerEntitlement: customerEntitlement!,
		balanceKey,
		routedRedis: routedCtx.redisV2,
	};
};

test.concurrent.skipIf(isBalanceWorkerRoute())(
	`${chalk.yellowBright("batch-reset-v2 cache: worker reset invalidates the subject balance hash")}`,
	async () => {
		const { ctx, customerEntitlement, balanceKey, routedRedis } =
			await initWarmedCacheScenario({
				customerId: "batch-reset-v2-cache-invalidation",
				planId: "cache-invalidation",
			});

		const subjectFieldBefore = await routedRedis.hget(
			balanceKey,
			customerEntitlement.id,
		);
		expect(subjectFieldBefore).not.toBeNull();

		await expireCusEntForReset({
			ctx,
			customerId: "batch-reset-v2-cache-invalidation",
			featureId: TestFeature.Messages,
			pastTimeMs: Date.now() - 1000,
		});

		const result = await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement.id],
		});
		expect(result.resetMutations.length).toBe(1);

		const subjectFieldAfter = await routedRedis.hget(
			balanceKey,
			customerEntitlement.id,
		);
		expect(subjectFieldAfter).toBeNull();
		const aggregatedFieldAfter = await routedRedis.hget(
			balanceKey,
			AGGREGATED_BALANCE_FIELD,
		);
		expect(aggregatedFieldAfter).toBeNull();
	},
);

test.concurrent.skipIf(isBalanceWorkerRoute())(
	`${chalk.yellowBright("batch-reset-v2 cache: skip verdicts do not clear the subject balance hash")}`,
	async () => {
		const { ctx, customerEntitlement, balanceKey, routedRedis } =
			await initWarmedCacheScenario({
				customerId: "batch-reset-v2-cache-no-op",
				planId: "cache-no-op",
			});

		expect(
			await routedRedis.hget(balanceKey, customerEntitlement.id),
		).not.toBeNull();

		const result = await runBatchResetV2({
			ctx,
			customerEntitlementIds: [customerEntitlement.id],
		});
		expect(result.resetMutations.length).toBe(0);

		expect(
			await routedRedis.hget(balanceKey, customerEntitlement.id),
		).not.toBeNull();
	},
);
