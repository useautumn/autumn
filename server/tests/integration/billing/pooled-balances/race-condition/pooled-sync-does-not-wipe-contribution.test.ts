import { expect, test } from "bun:test";
import { ApiVersion } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";
import { executeRedisDeductionV2 } from "@/internal/balances/utils/deductionV2/executeRedisDeductionV2.js";
import { syncItemV4 } from "@/internal/balances/utils/sync/syncItemV4.js";
import {
	getOrSetCachedFullSubject,
	invalidateCachedFullSubject,
} from "@/internal/customers/cache/fullSubject/index.js";
import { getPooledBalanceDbState } from "../utils/getPooledBalanceDbState.js";

const GRANT = 100;
const USAGE = 20;

test.skipIf(isBalanceWorkerRoute())(
	chalk.yellowBright(
		"pooled race: a stale sync must not wipe a contribution added after the snapshot",
	),
	async () => {
		const customerId = "pooled-race-stale-sync";
		const pooledPlan = products.pro({
			id: "pooled-race-plan",
			items: [
				{ ...items.monthlyMessages({ includedUsage: GRANT }), pooled: true },
			],
		});

		const { entities, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [pooledPlan] }),
			],
			actions: [s.billing.attach({ productId: pooledPlan.id, entityIndex: 0 })],
		});

		const afterFirstAttach = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(afterFirstAttach.pools).toHaveLength(1);
		expect(afterFirstAttach.pools[0].granted).toBe(GRANT);

		const fullSubject = await getOrSetCachedFullSubject({
			ctx,
			customerId,
			source: "pooled-race-setup",
		});
		const messagesFeature = ctx.features.find(
			(feature) => feature.id === TestFeature.Messages,
		);
		if (!messagesFeature) throw new Error("Messages feature not found");

		const deductionResult = await executeRedisDeductionV2({
			ctx,
			deductions: [{ feature: messagesFeature, deduction: USAGE }],
			fullSubject,
			deductionOptions: { overageBehaviour: "cap" },
		});

		const attachSkippingCacheDeletion = new AutumnInt({
			version: ApiVersion.V2_3,
			secretKey: ctx.orgSecretKey,
			skipCacheDeletion: true,
		});
		await attachSkippingCacheDeletion.billing.attach({
			customer_id: customerId,
			plan_id: pooledPlan.id,
			entity_id: entities[1].id,
		});

		const afterSecondAttach = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(afterSecondAttach.pools).toHaveLength(1);
		expect(afterSecondAttach.pools[0].granted).toBe(GRANT * 2);
		expect(afterSecondAttach.contributions).toHaveLength(2);

		await syncItemV4({
			ctx,
			payload: {
				customerId,
				orgId: ctx.org.id,
				env: ctx.env,
				timestamp: Date.now(),
				rolloverIds: Object.keys(deductionResult.rolloverUpdates),
				modifiedCusEntIdsByFeatureId:
					deductionResult.modifiedCusEntIdsByFeatureId,
				usageWindowUpdates: deductionResult.usageWindowUpdates,
			},
		});
		await invalidateCachedFullSubject({
			ctx,
			customerId,
			source: "pooled-race-assert",
		});

		const afterSync = await getPooledBalanceDbState({ db: ctx.db, customerId });
		expect(afterSync.pools).toHaveLength(1);
		expect(afterSync.contributions).toHaveLength(2);
		expect(afterSync.pools[0].granted).toBe(GRANT * 2);

		const pooledCustomerEntitlement = afterSync.poolCustomerEntitlements[0];
		expect(pooledCustomerEntitlement.balance).not.toBe(GRANT - USAGE);
		expect(pooledCustomerEntitlement.balance).toBeGreaterThanOrEqual(
			GRANT * 2 - USAGE,
		);
	},
);
