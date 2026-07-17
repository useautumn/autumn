/**
 * Server-backed contract for pooled rollover lifecycle and deduction ordering.
 *
 * Two compatible entity grants must share one managed pool. Its unused main
 * balance becomes exactly one rollover under concurrent reset reads, and the
 * normal global deduction order must consume that rollover before the newly
 * reset main balance.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	customers,
	EntInterval,
	PooledBalanceResetMode,
	pooledBalanceContributions,
	pooledBalances,
	RolloverExpiryDurationType,
	type TrackResponseV3,
} from "@autumn/shared";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expireCusEntForReset } from "@tests/utils/cusProductUtils/resetTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { Decimal } from "decimal.js";
import { eq } from "drizzle-orm";

const FIRST_CONTRIBUTION = 100;
const SECOND_CONTRIBUTION = 200;
const INITIAL_USAGE = 120;
const POST_RESET_USAGE = 200;
const TOTAL_CONTRIBUTION = new Decimal(FIRST_CONTRIBUTION)
	.add(SECOND_CONTRIBUTION)
	.toNumber();
const ROLLED_BALANCE = new Decimal(TOTAL_CONTRIBUTION)
	.sub(INITIAL_USAGE)
	.toNumber();
const TOTAL_AFTER_RESET = new Decimal(TOTAL_CONTRIBUTION)
	.add(ROLLED_BALANCE)
	.toNumber();
const MAIN_USAGE_AFTER_ROLLOVER = Decimal.max(
	0,
	new Decimal(POST_RESET_USAGE).sub(ROLLED_BALANCE),
).toNumber();
const FINAL_MAIN_BALANCE = new Decimal(TOTAL_CONTRIBUTION)
	.sub(MAIN_USAGE_AFTER_ROLLOVER)
	.toNumber();
const FINAL_TOTAL_BALANCE = new Decimal(TOTAL_AFTER_RESET)
	.sub(POST_RESET_USAGE)
	.toNumber();

const getPooledRolloverState = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const internalCustomer = await ctx.db.query.customers.findFirst({
		where: eq(customers.id, customerId),
	});
	if (!internalCustomer) {
		throw new Error(`Customer '${customerId}' not found`);
	}

	const pools = await ctx.db.query.pooledBalances.findMany({
		where: eq(
			pooledBalances.internal_customer_id,
			internalCustomer.internal_id,
		),
	});
	if (pools.length !== 1) {
		throw new Error(
			`Expected one compatible pooled balance, found ${pools.length}`,
		);
	}

	const pool = pools[0];
	const [contributions, customerEntitlement] = await Promise.all([
		ctx.db.query.pooledBalanceContributions.findMany({
			where: eq(pooledBalanceContributions.pooled_balance_id, pool.id),
		}),
		ctx.db.query.customerEntitlements.findFirst({
			where: (customerEntitlements, { eq: equals }) =>
				equals(customerEntitlements.id, pool.customer_entitlement_id),
			with: { rollovers: true },
		}),
	]);
	if (!customerEntitlement) {
		throw new Error("Expected the synthetic pooled customer entitlement");
	}

	return { contributions, customerEntitlement, pool };
};

test.concurrent(
	`${chalk.yellowBright("pooled rollover: compatible grants reset once and consume rollover before main balance")}`,
	async () => {
		const rolloverConfig = {
			max: null,
			length: 1,
			duration: RolloverExpiryDurationType.Month,
		};
		const firstPlan = products.base({
			id: "pooled-rollover-first",
			items: [
				{
					...items.monthlyMessagesWithRollover({
						includedUsage: FIRST_CONTRIBUTION,
						rolloverConfig,
					}),
					pooled: true,
				},
			],
		});
		const secondPlan = products.base({
			id: "pooled-rollover-second",
			items: [
				{
					...items.monthlyMessagesWithRollover({
						includedUsage: SECOND_CONTRIBUTION,
						rolloverConfig,
					}),
					pooled: true,
				},
			],
		});

		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "pooled-rollover-global-deduction",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
				s.products({ list: [firstPlan, secondPlan] }),
			],
			actions: [
				s.billing.attach({ productId: firstPlan.id, entityIndex: 0 }),
				s.billing.attach({ productId: secondPlan.id, entityIndex: 1 }),
				s.track({
					featureId: TestFeature.Messages,
					value: INITIAL_USAGE,
					entityIndex: 2,
					timeout: 2000,
				}),
			],
		});

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		const initialState = await getPooledRolloverState({ ctx, customerId });
		expect(initialState.pool).toMatchObject({
			interval: EntInterval.Month,
			interval_count: 1,
			reset_mode: PooledBalanceResetMode.Lazy,
		});
		expect(JSON.parse(initialState.pool.rollover_signature)).toEqual({
			max: null,
			max_percentage: null,
			duration: RolloverExpiryDurationType.Month,
			length: 1,
		});
		expect(initialState.contributions).toHaveLength(2);
		expect(
			initialState.contributions.map((contribution) => ({
				currentContribution: contribution.current_contribution,
				nextCycleContribution: contribution.next_cycle_contribution,
			})),
		).toEqual(
			expect.arrayContaining([
				{
					currentContribution: FIRST_CONTRIBUTION,
					nextCycleContribution: FIRST_CONTRIBUTION,
				},
				{
					currentContribution: SECOND_CONTRIBUTION,
					nextCycleContribution: SECOND_CONTRIBUTION,
				},
			]),
		);
		expect(initialState.customerEntitlement).toMatchObject({
			adjustment: TOTAL_CONTRIBUTION,
			balance: ROLLED_BALANCE,
		});
		expect(initialState.customerEntitlement.rollovers).toHaveLength(0);

		const resetAt = Date.now() - 1000;
		await expireCusEntForReset({
			ctx,
			customerId,
			featureId: TestFeature.Messages,
			pastTimeMs: resetAt,
		});

		const concurrentResetReads = await Promise.all([
			autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
				skip_cache: "true",
			}),
			autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
				skip_cache: "true",
			}),
		]);
		for (const afterResetCustomer of concurrentResetReads) {
			expectBalanceCorrect({
				customer: afterResetCustomer,
				featureId: TestFeature.Messages,
				granted: TOTAL_AFTER_RESET,
				remaining: TOTAL_AFTER_RESET,
				usage: 0,
				rollovers: [{ balance: ROLLED_BALANCE }],
			});
		}

		const afterResetState = await getPooledRolloverState({ ctx, customerId });
		expect(afterResetState.pool.id).toBe(initialState.pool.id);
		expect(afterResetState.pool.last_applied_reset_at).toBe(resetAt);
		expect(afterResetState.customerEntitlement).toMatchObject({
			adjustment: TOTAL_CONTRIBUTION,
			balance: TOTAL_CONTRIBUTION,
		});
		expect(afterResetState.customerEntitlement.rollovers).toHaveLength(1);
		expect(afterResetState.customerEntitlement.rollovers[0]).toMatchObject({
			balance: ROLLED_BALANCE,
			usage: 0,
		});

		const trackResponse = (await autumnV2_2.track(
			{
				customer_id: customerId,
				entity_id: entities[2].id,
				feature_id: TestFeature.Messages,
				value: POST_RESET_USAGE,
				overage_behavior: "reject",
			},
			{ timeout: 2000 },
		)) as TrackResponseV3;
		expect(trackResponse.balance).toMatchObject({
			granted: TOTAL_AFTER_RESET,
			remaining: FINAL_TOTAL_BALANCE,
			usage: POST_RESET_USAGE,
		});

		const finalState = await getPooledRolloverState({ ctx, customerId });
		expect(finalState.customerEntitlement).toMatchObject({
			adjustment: TOTAL_CONTRIBUTION,
			balance: FINAL_MAIN_BALANCE,
		});
		expect(finalState.customerEntitlement.rollovers).toHaveLength(1);
		expect(finalState.customerEntitlement.rollovers[0]).toMatchObject({
			balance: 0,
			usage: ROLLED_BALANCE,
		});

		const finalCustomer = await autumnV2_2.customers.get<ApiCustomerV5>(
			customerId,
			{ skip_cache: "true" },
		);
		expectBalanceCorrect({
			customer: finalCustomer,
			featureId: TestFeature.Messages,
			granted: TOTAL_AFTER_RESET,
			remaining: FINAL_TOTAL_BALANCE,
			usage: POST_RESET_USAGE,
			rollovers: [{ balance: 0 }],
		});
	},
	60_000,
);
