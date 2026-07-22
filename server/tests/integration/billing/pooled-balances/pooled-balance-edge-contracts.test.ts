/** Server-backed contracts for pooled lifetime grants, deduction order, and public recalculation. */

import { expect, test } from "bun:test";
import {
	type CheckResponseV3,
	customerEntitlements,
	customerProducts,
	customers,
	EntInterval,
	type LimitedItem,
	PooledBalanceResetMode,
	ProductItemInterval,
	pooledBalanceContributions,
	pooledBalances,
	type RecalculateBalancePreview,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { and, eq, inArray } from "drizzle-orm";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";

const getPooledBalanceState = async ({
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
	if (pools.length === 0) {
		throw new Error(`Customer '${customerId}' has no pooled balances`);
	}

	const poolCustomerEntitlements =
		await ctx.db.query.customerEntitlements.findMany({
			where: inArray(
				customerEntitlements.id,
				pools.map((pool) => pool.customer_entitlement_id),
			),
		});

	return { internalCustomer, pools, poolCustomerEntitlements };
};

test.concurrent(
	`${chalk.yellowBright("pooled edge: compatible lifetime entity grants coalesce and source removal retains usage as debt")}`,
	async () => {
		const lifetimePlan = products.base({
			id: "pooled-lifetime-source",
			items: [
				{
					...items.lifetimeMessages({ includedUsage: 500 }),
					pooled: true,
				},
			],
		});

		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "pooled-lifetime-source-removal-debt",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
				s.products({ list: [lifetimePlan] }),
			],
			actions: [
				s.billing.attach({ productId: lifetimePlan.id, entityIndex: 0 }),
				s.billing.attach({ productId: lifetimePlan.id, entityIndex: 1 }),
				s.track({
					featureId: TestFeature.Messages,
					value: 700,
					entityIndex: 2,
					timeout: 2000,
				}),
			],
		});

		const beforeRemoval = await getPooledBalanceState({ ctx, customerId });
		expect(beforeRemoval.pools).toHaveLength(1);
		expect(beforeRemoval.pools[0]).toMatchObject({
			interval: EntInterval.Lifetime,
			reset_cycle_anchor: null,
			reset_mode: PooledBalanceResetMode.Lifetime,
		});
		expect(beforeRemoval.poolCustomerEntitlements).toHaveLength(1);
		expect(beforeRemoval.poolCustomerEntitlements[0]).toMatchObject({
			adjustment: 1000,
			balance: 300,
			next_reset_at: null,
			reset_cycle_anchor: null,
		});

		const contributionsBeforeRemoval =
			await ctx.db.query.pooledBalanceContributions.findMany({
				where: eq(
					pooledBalanceContributions.pooled_balance_id,
					beforeRemoval.pools[0].id,
				),
			});
		expect(contributionsBeforeRemoval).toHaveLength(2);
		expect(
			contributionsBeforeRemoval.map((contribution) => ({
				currentContribution: contribution.current_contribution,
				nextCycleContribution: contribution.next_cycle_contribution,
			})),
		).toEqual(
			expect.arrayContaining([
				{ currentContribution: 500, nextCycleContribution: 500 },
				{ currentContribution: 500, nextCycleContribution: 500 },
			]),
		);

		const sourceCustomerProduct = await ctx.db.query.customerProducts.findFirst(
			{
				where: and(
					eq(customerProducts.customer_id, customerId),
					eq(customerProducts.entity_id, entities[0].id),
				),
			},
		);
		if (!sourceCustomerProduct) {
			throw new Error("Expected a lifetime pooled source customer product");
		}

		await autumnV2_2.billing.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			customer_product_id: sourceCustomerProduct.id,
			entity_id: entities[0].id,
			cancel_action: "cancel_immediately",
		});

		const afterRemoval = await getPooledBalanceState({ ctx, customerId });
		expect(afterRemoval.pools).toHaveLength(1);
		expect(afterRemoval.poolCustomerEntitlements[0]).toMatchObject({
			adjustment: 500,
			balance: -200,
			next_reset_at: null,
			reset_cycle_anchor: null,
		});

		const removedContribution =
			await ctx.db.query.pooledBalanceContributions.findFirst({
				where: eq(
					pooledBalanceContributions.source_customer_product_id,
					sourceCustomerProduct.id,
				),
			});
		expect(removedContribution).toMatchObject({
			current_contribution: 0,
			next_cycle_contribution: 0,
		});

		const check = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[2].id,
			feature_id: TestFeature.Messages,
		});
		expect(check.allowed).toEqual(false);
		expect(check.balance).toMatchObject({
			granted: 500,
			remaining: 0,
			usage: 700,
		});
	},
	60_000,
);

const assertIntervalDeductionOrder = async ({
	reverseOrder,
}: {
	reverseOrder: boolean;
}) => {
	const caseId = reverseOrder ? "reverse" : "default";
	const dailyPlan = products.base({
		id: `pooled-daily-${caseId}`,
		items: [
			{
				...(constructFeatureItem({
					featureId: TestFeature.Messages,
					includedUsage: 100,
					interval: ProductItemInterval.Day,
				}) as LimitedItem),
				pooled: true,
			},
		],
	});
	const monthlyPlan = products.base({
		id: `pooled-monthly-${caseId}`,
		items: [
			{
				...items.monthlyMessages({ includedUsage: 100 }),
				pooled: true,
			},
		],
	});

	const { customerId, entities, autumnV2_2, ctx } = await initScenario({
		customerId: `pooled-interval-order-${caseId}`,
		setup: [
			s.platform.create({
				userEmail: `pooled-order-${caseId}-${Math.random()
					.toString(36)
					.slice(2, 8)}@autumn.test`,
				configOverrides: { reverse_deduction_order: reverseOrder },
				setupDefaultFeatures: true,
			}),
			s.customer({ testClock: false }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
			s.products({ list: [dailyPlan, monthlyPlan] }),
		],
		actions: [
			s.billing.attach({ productId: dailyPlan.id, entityIndex: 0 }),
			s.billing.attach({ productId: monthlyPlan.id, entityIndex: 1 }),
		],
	});

	const initialState = await getPooledBalanceState({ ctx, customerId });
	expect(initialState.pools).toHaveLength(2);
	const dailyPool = initialState.pools.find(
		(pool) => pool.interval === EntInterval.Day,
	);
	const monthlyPool = initialState.pools.find(
		(pool) => pool.interval === EntInterval.Month,
	);
	if (!dailyPool || !monthlyPool) {
		throw new Error("Expected separate daily and monthly pooled balances");
	}

	const now = Date.now();
	const monthlyResetAt = now + 3 * 24 * 60 * 60 * 1000;
	const dailyResetAt = now + 4 * 24 * 60 * 60 * 1000;
	await Promise.all([
		ctx.db
			.update(customerEntitlements)
			.set({ next_reset_at: monthlyResetAt })
			.where(eq(customerEntitlements.id, monthlyPool.customer_entitlement_id)),
		ctx.db
			.update(customerEntitlements)
			.set({ next_reset_at: dailyResetAt })
			.where(eq(customerEntitlements.id, dailyPool.customer_entitlement_id)),
	]);
	await deleteCachedFullCustomer({
		ctx,
		customerId,
		source: `pooled-interval-order-${caseId}`,
	});

	const preparedState = await getPooledBalanceState({ ctx, customerId });
	const preparedById = new Map(
		preparedState.poolCustomerEntitlements.map((customerEntitlement) => [
			customerEntitlement.id,
			customerEntitlement,
		]),
	);
	expect(
		preparedById.get(monthlyPool.customer_entitlement_id)?.next_reset_at,
	).toEqual(monthlyResetAt);
	expect(
		preparedById.get(dailyPool.customer_entitlement_id)?.next_reset_at,
	).toEqual(dailyResetAt);
	expect(monthlyResetAt).toBeLessThan(dailyResetAt);

	await autumnV2_2.track(
		{
			customer_id: customerId,
			entity_id: entities[2].id,
			feature_id: TestFeature.Messages,
			value: 125,
			overage_behavior: "reject",
		},
		{ timeout: 2000 },
	);

	const afterTrack = await getPooledBalanceState({ ctx, customerId });
	const afterTrackById = new Map(
		afterTrack.poolCustomerEntitlements.map((customerEntitlement) => [
			customerEntitlement.id,
			customerEntitlement,
		]),
	);
	expect(afterTrackById.get(dailyPool.customer_entitlement_id)).toMatchObject({
		adjustment: 100,
		balance: reverseOrder ? 75 : 0,
	});
	expect(afterTrackById.get(monthlyPool.customer_entitlement_id)).toMatchObject(
		{
			adjustment: 100,
			balance: reverseOrder ? 0 : 75,
		},
	);

	const check = await autumnV2_2.check<CheckResponseV3>({
		customer_id: customerId,
		entity_id: entities[2].id,
		feature_id: TestFeature.Messages,
	});
	expect(check.balance).toMatchObject({
		granted: 200,
		remaining: 75,
		usage: 125,
	});
};

test.concurrent(
	`${chalk.yellowBright("pooled edge: daily is deducted before monthly even when monthly resets sooner")}`,
	async () => {
		await assertIntervalDeductionOrder({ reverseOrder: false });
	},
	120_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled edge: reverse deduction order consumes monthly before daily")}`,
	async () => {
		await assertIntervalDeductionOrder({ reverseOrder: true });
	},
	120_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled edge: entities can spend pooled features contributed by sibling entities")}`,
	async () => {
		const messagesPlan = products.base({
			id: "pooled-cross-feature-messages",
			items: [
				{
					...items.monthlyMessages({ includedUsage: 100 }),
					pooled: true,
				},
			],
		});
		const storagePlan = products.base({
			id: "pooled-cross-feature-storage",
			items: [
				{
					...(constructFeatureItem({
						featureId: TestFeature.Storage,
						includedUsage: 200,
						interval: ProductItemInterval.Month,
					}) as LimitedItem),
					pooled: true,
				},
			],
		});

		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "pooled-cross-feature-sibling-access",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [messagesPlan, storagePlan] }),
			],
			actions: [
				s.billing.attach({ productId: messagesPlan.id, entityIndex: 0 }),
				s.billing.attach({ productId: storagePlan.id, entityIndex: 1 }),
				s.track({
					featureId: TestFeature.Storage,
					value: 60,
					entityIndex: 0,
					timeout: 2000,
				}),
				s.track({
					featureId: TestFeature.Messages,
					value: 40,
					entityIndex: 1,
					timeout: 2000,
				}),
			],
		});

		const pooledState = await getPooledBalanceState({ ctx, customerId });
		expect(pooledState.pools).toHaveLength(2);

		const [messagesCheck, storageCheck] = await Promise.all([
			autumnV2_2.check<CheckResponseV3>({
				customer_id: customerId,
				entity_id: entities[1].id,
				feature_id: TestFeature.Messages,
			}),
			autumnV2_2.check<CheckResponseV3>({
				customer_id: customerId,
				entity_id: entities[0].id,
				feature_id: TestFeature.Storage,
			}),
		]);
		expect(messagesCheck.balance).toMatchObject({
			granted: 100,
			remaining: 60,
			usage: 40,
		});
		expect(storageCheck.balance).toMatchObject({
			granted: 200,
			remaining: 140,
			usage: 60,
		});
	},
	60_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled legacy attach: an entity source is routed through the V2 pooled lifecycle")}`,
	async () => {
		const pooledPlan = products.base({
			id: "pooled-legacy-entity-attach",
			items: [
				{
					...items.monthlyMessages({ includedUsage: 500 }),
					pooled: true,
				},
			],
		});
		const { customerId, entities, autumnV1, autumnV2_2, ctx } =
			await initScenario({
				customerId: "pooled-legacy-entity-attach",
				setup: [
					s.customer({ testClock: false }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
					s.products({ list: [pooledPlan] }),
				],
				actions: [],
			});

		await autumnV1.attach({
			customer_id: customerId,
			entity_id: entities[0].id,
			product_id: pooledPlan.id,
		});

		const state = await getPooledBalanceState({ ctx, customerId });
		expect(state.pools).toHaveLength(1);
		expect(state.poolCustomerEntitlements).toHaveLength(1);
		expect(state.poolCustomerEntitlements[0]).toMatchObject({
			adjustment: 500,
			balance: 500,
		});
		const contributions =
			await ctx.db.query.pooledBalanceContributions.findMany({
				where: eq(
					pooledBalanceContributions.pooled_balance_id,
					state.pools[0].id,
				),
			});
		expect(contributions).toHaveLength(1);
		expect(contributions[0]).toMatchObject({
			current_contribution: 500,
			next_cycle_contribution: 500,
		});

		await autumnV2_2.track(
			{
				customer_id: customerId,
				entity_id: entities[1].id,
				feature_id: TestFeature.Messages,
				value: 125,
			},
			{ timeout: 2000 },
		);
		const check = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
		});
		expect(check.balance).toMatchObject({
			granted: 500,
			remaining: 375,
			usage: 125,
		});
	},
	60_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled edge: public recalculation preserves a consumed contribution-backed synthetic pool")}`,
	async () => {
		const pooledPlan = products.base({
			id: "pooled-public-recalculate",
			items: [
				{
					...items.monthlyMessages({ includedUsage: 500 }),
					pooled: true,
				},
			],
		});

		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "pooled-public-recalculate",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
				s.products({ list: [pooledPlan] }),
			],
			actions: [
				s.billing.attach({ productId: pooledPlan.id, entityIndex: 0 }),
				s.billing.attach({ productId: pooledPlan.id, entityIndex: 1 }),
				s.track({
					featureId: TestFeature.Messages,
					value: 300,
					entityIndex: 2,
					timeout: 2000,
				}),
			],
		});

		const beforePreview = await getPooledBalanceState({ ctx, customerId });
		expect(beforePreview.pools).toHaveLength(1);
		const pool = beforePreview.pools[0];
		expect(beforePreview.poolCustomerEntitlements).toHaveLength(1);
		expect(beforePreview.poolCustomerEntitlements[0]).toMatchObject({
			adjustment: 1000,
			balance: 700,
		});

		const sourceCustomerProducts = await ctx.db.query.customerProducts.findMany(
			{
				where: eq(
					customerProducts.internal_customer_id,
					beforePreview.internalCustomer.internal_id,
				),
			},
		);
		expect(sourceCustomerProducts).toHaveLength(2);
		const sourceCustomerEntitlements =
			await ctx.db.query.customerEntitlements.findMany({
				where: inArray(
					customerEntitlements.customer_product_id,
					sourceCustomerProducts.map(
						(sourceCustomerProduct) => sourceCustomerProduct.id,
					),
				),
			});
		expect(sourceCustomerEntitlements).toHaveLength(2);
		for (const sourceCustomerEntitlement of sourceCustomerEntitlements) {
			expect(sourceCustomerEntitlement).toMatchObject({
				adjustment: 0,
				balance: 0,
			});
		}

		const contributionsBefore =
			await ctx.db.query.pooledBalanceContributions.findMany({
				where: eq(pooledBalanceContributions.pooled_balance_id, pool.id),
			});
		expect(contributionsBefore).toHaveLength(2);
		expect(
			contributionsBefore.reduce(
				(sum, contribution) => sum + contribution.current_contribution,
				0,
			),
		).toEqual(1000);

		const preview: RecalculateBalancePreview =
			await autumnV2_2.balances.previewRecalculate({
				customer_id: customerId,
				feature_id: TestFeature.Messages,
			});
		expect(preview).toEqual({
			total_usage: 300,
			entitlements: [
				{
					customer_entitlement_id: pool.customer_entitlement_id,
					before_remaining: 700,
					after_remaining: 700,
				},
			],
		});

		const afterPreview = await ctx.db.query.customerEntitlements.findFirst({
			where: eq(customerEntitlements.id, pool.customer_entitlement_id),
		});
		expect(afterPreview).toMatchObject({ adjustment: 1000, balance: 700 });

		await autumnV2_2.balances.recalculate({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});

		const [afterApply, contributionsAfter] = await Promise.all([
			ctx.db.query.customerEntitlements.findFirst({
				where: eq(customerEntitlements.id, pool.customer_entitlement_id),
			}),
			ctx.db.query.pooledBalanceContributions.findMany({
				where: eq(pooledBalanceContributions.pooled_balance_id, pool.id),
			}),
		]);
		expect(afterApply).toMatchObject({ adjustment: 1000, balance: 700 });
		expect(
			contributionsAfter.reduce(
				(sum, contribution) => sum + contribution.current_contribution,
				0,
			),
		).toEqual(1000);

		const check = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[2].id,
			feature_id: TestFeature.Messages,
		});
		expect(check.balance).toMatchObject({
			granted: 1000,
			remaining: 700,
			usage: 300,
		});
	},
	60_000,
);
