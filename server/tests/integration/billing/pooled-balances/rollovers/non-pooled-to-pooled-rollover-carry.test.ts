import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type AttachParamsV1Input,
	RolloverExpiryDurationType,
} from "@autumn/shared";
import { findCustomerEntitlement } from "@tests/balances/utils/findCustomerEntitlement.js";
import { runBatchResetV2 } from "@tests/integration/cron/batch-reset-v2/batchResetV2TestUtils.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { getPooledBalanceDbState } from "../utils/getPooledBalanceDbState.js";

const GRANT = 100;
const USAGE = 40;
const POOLED_GRANT = 200;

const CARRIED = GRANT * 0.5;
const rolloverConfig = {
	max_percentage: 50,
	length: 1,
	duration: RolloverExpiryDurationType.Month,
};

test(
	chalk.yellowBright(
		"pooled rollover carry: a non-pooled balance's rollover survives the move to a pooled one",
	),
	async () => {
		const customerId = "non-pooled-to-pooled-rollover";

		const nonPooledPro = products.pro({
			id: "non-pooled-rollover-pro",
			items: [
				items.monthlyMessagesWithRollover({
					includedUsage: GRANT,
					rolloverConfig,
				}),
			],
		});
		const pooledPro = products.premium({
			id: "pooled-rollover-premium",
			items: [
				{
					...items.monthlyMessagesWithRollover({
						includedUsage: POOLED_GRANT,
						rolloverConfig,
					}),
					pooled: true,
				},
			],
		});

		const { entities, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success", testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [nonPooledPro, pooledPro] }),
			],
			actions: [
				s.billing.attach({ productId: nonPooledPro.id, entityIndex: 0 }),
				s.track({
					featureId: TestFeature.Messages,
					value: USAGE,
					entityIndex: 0,
					timeout: 2000,
				}),
			],
		});

		const nonPooledCusEnt = await findCustomerEntitlement({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		if (!nonPooledCusEnt) throw new Error("non-pooled cusEnt not found");

		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
		});
		await runBatchResetV2({
			ctx,
			customerEntitlementIds: [nonPooledCusEnt.id],
		});
		const customerAfterReset = await autumnV2_3.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		const carriedRollover = CARRIED;
		if (!isBalanceWorkerRoute()) {
			expect(
				customerAfterReset.balances?.[TestFeature.Messages]?.remaining,
			).toBe(GRANT + carriedRollover);
		}

		const beforeMove = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(beforeMove.pools).toHaveLength(0);

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			entity_id: entities[0].id,
			plan_id: pooledPro.id,
			redirect_mode: "if_required",
		});

		const afterMove = await getPooledBalanceDbState({ db: ctx.db, customerId });
		expect(afterMove.pools).toHaveLength(1);
		expect(afterMove.pools[0].granted).toBe(POOLED_GRANT);

		const pooledCustomerEntitlement = afterMove.poolCustomerEntitlements[0];
		const pooledRollovers = pooledCustomerEntitlement.rollovers ?? [];
		expect(pooledRollovers).toHaveLength(1);
		expect(pooledRollovers[0].balance).toBe(carriedRollover);

		const customerAfterMove = await autumnV2_3.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		expect(customerAfterMove.balances?.[TestFeature.Messages]?.remaining).toBe(
			POOLED_GRANT + carriedRollover,
		);
	},
);
