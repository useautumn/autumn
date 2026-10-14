import { expect, test } from "bun:test";
import type {
	ApiCustomerV5,
	UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import chalk from "chalk";
import { getPooledBalanceDbState } from "../utils/getPooledBalanceDbState.js";
import { setupMergedPoolScenario } from "../utils/mergedPoolScenario.js";

const GRANT = 10_000;
const USAGE = 100;
const MERGED_GRANT = GRANT * 2;
const REMAINING_AFTER_USAGE = MERGED_GRANT - USAGE;
const NEW_BASE_PRICE = 45;

const sumBalances = (
	state: Awaited<ReturnType<typeof getPooledBalanceDbState>>,
) =>
	state.pools.reduce((sum, pool) => {
		const synthetic = state.poolCustomerEntitlements.find(
			(candidate) => candidate.id === pool.customer_entitlement_id,
		);
		return sum + (synthetic?.balance ?? 0);
	}, 0);

const sumGranted = (
	state: Awaited<ReturnType<typeof getPooledBalanceDbState>>,
) => state.pools.reduce((sum, pool) => sum + pool.granted, 0);

test(
	chalk.yellowBright(
		"pooled merge scenario A: customizing base price on the mis-matched plan conserves the pooled balance",
	),
	async () => {
		const scenario = await setupMergedPoolScenario({
			customerId: "pooled-merged-customize-base-price",
			grant: GRANT,
			usage: { value: USAGE, entityIndex: 1 },
		});
		const { ctx, customerId, autumnV2_3 } = scenario;

		const baseline = await getPooledBalanceDbState({ db: ctx.db, customerId });
		expect(baseline.pools).toHaveLength(1);
		expect(baseline.contributions).toHaveLength(2);
		expect(sumGranted(baseline)).toBe(MERGED_GRANT);
		expect(sumBalances(baseline)).toBe(REMAINING_AFTER_USAGE);

		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			customer_product_id: scenario.mismatchedCustomerProduct.id,
			entity_id: scenario.mismatchedEntityId ?? undefined,
			customize: { price: itemsV2.monthlyPrice({ amount: NEW_BASE_PRICE }) },
		});

		const afterUpdate = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(sumGranted(afterUpdate)).toBe(MERGED_GRANT);
		expect(sumBalances(afterUpdate)).toBe(REMAINING_AFTER_USAGE);

		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		expect(customer.balances?.[TestFeature.Messages]?.remaining).toBe(
			REMAINING_AFTER_USAGE,
		);
	},
);
