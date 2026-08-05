/**
 * Transitions of a customer product whose pooled contribution was repointed by
 * the combine-pools merge, and therefore sits on a pool identified by a
 * DIFFERENT subscription.
 *
 * Recreated faithfully by setupMergedPoolScenario: entity 1 attaches the plan,
 * entity 2 attaches the same plan on its own Stripe subscription, then the two
 * pools are merged the way the production script merges them.
 *
 * Scenario A: spend from the pooled balance, then customize the base price on
 * the mis-matched plan. The removal from the old pool and the insert into the
 * newly identified one must balance — no credits created or destroyed.
 *
 * Red-failure mode (before the upsertPooledBalance fix):
 *  - the removal debits the merged pool correctly, but the insert seeds the new
 *    pool from the source cusEnt, which is zeroed for an existing contributor.
 *    The grant is dropped and the customer loses one contribution's worth.
 */

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

		// ── Baseline: one merged pool holding both contributions.
		const baseline = await getPooledBalanceDbState({ db: ctx.db, customerId });
		expect(baseline.pools).toHaveLength(1);
		expect(baseline.contributions).toHaveLength(2);
		expect(sumGranted(baseline)).toBe(MERGED_GRANT);
		expect(sumBalances(baseline)).toBe(REMAINING_AFTER_USAGE);

		// ── Act: customize the base price on the plan whose contribution the
		// merge left pointing at the other subscription's pool.
		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			customer_product_id: scenario.mismatchedCustomerProduct.id,
			entity_id: scenario.mismatchedEntityId ?? undefined,
			customize: { price: itemsV2.monthlyPrice({ amount: NEW_BASE_PRICE }) },
		});

		// ── Contract: nothing is created or destroyed by the transition.
		const afterUpdate = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(sumGranted(afterUpdate)).toBe(MERGED_GRANT);
		expect(sumBalances(afterUpdate)).toBe(REMAINING_AFTER_USAGE);

		// ── Contract: and the customer reads the same remaining balance.
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		expect(customer.balances?.[TestFeature.Messages]?.remaining).toBe(
			REMAINING_AFTER_USAGE,
		);
	},
);
