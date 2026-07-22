/** Server-backed contracts for managed-pool transitions and ordinary customer-level balances. */

import { expect, test } from "bun:test";
import {
	type CheckResponseV3,
	CusProductStatus,
	customerEntitlements,
	customerProducts,
	customers,
	EntInterval,
	pooledBalanceContributions,
	pooledBalances,
	ResetInterval,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2.js";
import { products } from "@tests/utils/fixtures/products.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq, inArray } from "drizzle-orm";

const getPooledTransitionState = async ({
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

	const [customerProductRows, pools] = await Promise.all([
		ctx.db.query.customerProducts.findMany({
			where: eq(
				customerProducts.internal_customer_id,
				internalCustomer.internal_id,
			),
			with: { customer_entitlements: { with: { entitlement: true } } },
		}),
		ctx.db.query.pooledBalances.findMany({
			where: eq(
				pooledBalances.internal_customer_id,
				internalCustomer.internal_id,
			),
		}),
	]);

	const sourceCustomerProductIds = customerProductRows.map(
		(customerProduct) => customerProduct.id,
	);
	const poolCustomerEntitlementIds = pools.map(
		(pool) => pool.customer_entitlement_id,
	);
	const [contributions, poolCustomerEntitlements] = await Promise.all([
		sourceCustomerProductIds.length === 0
			? []
			: ctx.db.query.pooledBalanceContributions.findMany({
					where: inArray(
						pooledBalanceContributions.source_customer_product_id,
						sourceCustomerProductIds,
					),
				}),
		poolCustomerEntitlementIds.length === 0
			? []
			: ctx.db.query.customerEntitlements.findMany({
					where: inArray(customerEntitlements.id, poolCustomerEntitlementIds),
				}),
	]);

	return {
		contributions,
		customerProductRows,
		internalCustomer,
		poolCustomerEntitlements,
		pools,
	};
};

test.concurrent(
	`${chalk.yellowBright("pooled transition: pooled to private preserves shared history on the synthetic tombstone")}`,
	async () => {
		const pooledPlan = products.base({
			id: "pooled-to-private-transition",
			items: [
				{
					...items.monthlyMessages({ includedUsage: 500 }),
					pooled: true,
				},
			],
		});
		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "pooled-to-private-transition",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [pooledPlan] }),
			],
			actions: [
				s.billing.attach({ productId: pooledPlan.id, entityIndex: 0 }),
				s.track({
					featureId: TestFeature.Messages,
					value: 400,
					entityIndex: 1,
					timeout: 2000,
				}),
			],
		});

		const beforeTransition = await getPooledTransitionState({
			ctx,
			customerId,
		});
		expect(beforeTransition.pools).toHaveLength(1);
		const originalCustomerProduct = beforeTransition.customerProductRows.find(
			(customerProduct) => customerProduct.status === CusProductStatus.Active,
		);
		if (!originalCustomerProduct) {
			throw new Error("Expected an active managed pooled source");
		}
		const originalPool = beforeTransition.pools[0];
		const originalContribution = beforeTransition.contributions.find(
			(contribution) =>
				contribution.source_customer_product_id === originalCustomerProduct.id,
		);
		expect(originalContribution).toMatchObject({
			current_contribution: 500,
			next_cycle_contribution: 500,
		});

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			customer_product_id: originalCustomerProduct.id,
			entity_id: entities[0].id,
			customize: {
				items: [itemsV2.monthlyMessages({ included: 500 })],
			},
		});

		const afterTransition = await getPooledTransitionState({ ctx, customerId });
		expect(afterTransition.pools).toHaveLength(1);
		expect(afterTransition.pools[0]?.id).toBe(originalPool?.id);
		const syntheticTombstone = afterTransition.poolCustomerEntitlements.find(
			(customerEntitlement) =>
				customerEntitlement.id === originalPool?.customer_entitlement_id,
		);
		expect(syntheticTombstone).toMatchObject({
			customer_product_id: null,
			adjustment: 0,
			balance: -400,
		});

		const removedContribution = afterTransition.contributions.find(
			(contribution) =>
				contribution.source_customer_product_id === originalCustomerProduct.id,
		);
		expect(removedContribution).toMatchObject({
			current_contribution: 0,
			next_cycle_contribution: 0,
		});
		const privateCustomerProduct = afterTransition.customerProductRows.find(
			(customerProduct) => customerProduct.status === CusProductStatus.Active,
		);
		if (!privateCustomerProduct) {
			throw new Error("Expected an active private successor product");
		}
		expect(privateCustomerProduct.id).not.toBe(originalCustomerProduct.id);
		expect(privateCustomerProduct.customer_entitlements).toHaveLength(1);
		expect(privateCustomerProduct.customer_entitlements[0]).toMatchObject({
			balance: 500,
			adjustment: 0,
			entitlement: { pooled: false },
		});

		const [privateEntityCheck, otherEntityCheck] = await Promise.all([
			autumnV2_2.check<CheckResponseV3>({
				customer_id: customerId,
				entity_id: entities[0].id,
				feature_id: TestFeature.Messages,
			}),
			autumnV2_2.check<CheckResponseV3>({
				customer_id: customerId,
				entity_id: entities[1].id,
				feature_id: TestFeature.Messages,
			}),
		]);
		expect(privateEntityCheck.allowed).toBe(true);
		expect(privateEntityCheck.balance).toMatchObject({
			granted: 500,
			remaining: 500,
			usage: 400,
		});
		expect(otherEntityCheck.allowed).toBe(false);
		expect(otherEntityCheck.balance).toMatchObject({
			granted: 0,
			remaining: 0,
			usage: 400,
		});
	},
	60_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled transition: incompatible pooled replacement removes, upserts, and reapplies usage")}`,
	async () => {
		const monthlyPooledPlan = products.base({
			id: "pooled-incompatible-transition",
			items: [
				{
					...items.monthlyMessages({ includedUsage: 500 }),
					pooled: true,
				},
			],
		});
		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "pooled-incompatible-transition",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [monthlyPooledPlan] }),
			],
			actions: [
				s.billing.attach({
					productId: monthlyPooledPlan.id,
					entityIndex: 0,
				}),
				s.track({
					featureId: TestFeature.Messages,
					value: 400,
					entityIndex: 1,
					timeout: 2000,
				}),
			],
		});

		const beforeTransition = await getPooledTransitionState({
			ctx,
			customerId,
		});
		const originalCustomerProduct = beforeTransition.customerProductRows.find(
			(customerProduct) => customerProduct.status === CusProductStatus.Active,
		);
		if (!originalCustomerProduct) {
			throw new Error("Expected an active monthly pooled source");
		}
		expect(beforeTransition.pools).toHaveLength(1);
		expect(beforeTransition.pools[0]).toMatchObject({
			interval: EntInterval.Month,
		});

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			customer_product_id: originalCustomerProduct.id,
			entity_id: entities[0].id,
			customize: {
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 800,
						reset: { interval: ResetInterval.Day },
						pooled: true,
					},
				],
			},
		});

		const afterTransition = await getPooledTransitionState({ ctx, customerId });
		expect(afterTransition.pools).toHaveLength(2);
		const monthlyPool = afterTransition.pools.find(
			(pool) => pool.interval === EntInterval.Month,
		);
		const dailyPool = afterTransition.pools.find(
			(pool) => pool.interval === EntInterval.Day,
		);
		if (!monthlyPool || !dailyPool) {
			throw new Error("Expected separate monthly and daily pooled balances");
		}

		const poolCustomerEntitlementsById = new Map(
			afterTransition.poolCustomerEntitlements.map((customerEntitlement) => [
				customerEntitlement.id,
				customerEntitlement,
			]),
		);
		expect(
			poolCustomerEntitlementsById.get(monthlyPool.customer_entitlement_id),
		).toMatchObject({
			adjustment: 0,
			balance: 0,
		});
		expect(
			poolCustomerEntitlementsById.get(dailyPool.customer_entitlement_id),
		).toMatchObject({
			adjustment: 800,
			balance: 400,
		});

		const successorCustomerProduct = afterTransition.customerProductRows.find(
			(customerProduct) => customerProduct.status === CusProductStatus.Active,
		);
		if (!successorCustomerProduct) {
			throw new Error("Expected an active daily pooled successor");
		}
		const contributionBySourceId = new Map(
			afterTransition.contributions.map((contribution) => [
				contribution.source_customer_product_id,
				contribution,
			]),
		);
		expect(
			contributionBySourceId.get(originalCustomerProduct.id),
		).toMatchObject({
			current_contribution: 0,
			next_cycle_contribution: 0,
		});
		expect(
			contributionBySourceId.get(successorCustomerProduct.id),
		).toMatchObject({
			pooled_balance_id: dailyPool.id,
			current_contribution: 800,
			next_cycle_contribution: 800,
		});

		const check = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
		});
		expect(check.allowed).toBe(true);
		expect(check.balance).toMatchObject({
			granted: 800,
			remaining: 400,
			usage: 400,
		});
	},
	60_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled classification: a customer-level pooled catalog item remains an ordinary balance")}`,
	async () => {
		const customerLevelPlan = products.base({
			id: "customer-level-pooled-ordinary",
			items: [
				{
					...items.monthlyMessages({ includedUsage: 500 }),
					pooled: true,
				},
			],
		});
		const { customerId, autumnV2_2, ctx } = await initScenario({
			customerId: "customer-level-pooled-ordinary",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [customerLevelPlan] }),
			],
			actions: [
				s.billing.attach({ productId: customerLevelPlan.id }),
				s.track({
					featureId: TestFeature.Messages,
					value: 200,
					timeout: 2000,
				}),
			],
		});

		const state = await getPooledTransitionState({ ctx, customerId });
		expect(state.pools).toHaveLength(0);
		expect(state.contributions).toHaveLength(0);
		const activeCustomerProduct = state.customerProductRows.find(
			(customerProduct) => customerProduct.status === CusProductStatus.Active,
		);
		if (!activeCustomerProduct) {
			throw new Error("Expected an active customer-level product");
		}
		expect(activeCustomerProduct.internal_entity_id).toBeNull();
		expect(activeCustomerProduct.customer_entitlements).toHaveLength(1);
		expect(activeCustomerProduct.customer_entitlements[0]).toMatchObject({
			balance: 300,
			adjustment: 0,
			entitlement: { pooled: true },
		});

		const check = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(check.balance).toMatchObject({
			granted: 500,
			remaining: 300,
			usage: 200,
		});
	},
	60_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled classification: customer-level prepaid quantity updates stay off the pool graph")}`,
	async () => {
		const customerLevelPrepaidPlan = products.base({
			id: "customer-level-pooled-prepaid-ordinary",
			items: [
				{
					...items.prepaidMessages({
						includedUsage: 0,
						billingUnits: 100,
						price: 10,
					}),
					pooled: true,
				},
			],
		});
		const { customerId, autumnV2_2, ctx } = await initScenario({
			customerId: "customer-level-pooled-prepaid-ordinary",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [customerLevelPrepaidPlan] }),
			],
			actions: [],
		});

		await autumnV2_2.billing.attach({
			customer_id: customerId,
			plan_id: customerLevelPrepaidPlan.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 300 }],
		});
		await autumnV2_2.billing.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: customerLevelPrepaidPlan.id,
			feature_quantities: [{ feature_id: TestFeature.Messages, quantity: 500 }],
		});

		const state = await getPooledTransitionState({ ctx, customerId });
		expect(state.pools).toHaveLength(0);
		expect(state.contributions).toHaveLength(0);
		const activeCustomerProduct = state.customerProductRows.find(
			(customerProduct) => customerProduct.status === CusProductStatus.Active,
		);
		if (!activeCustomerProduct) {
			throw new Error("Expected an active customer-level prepaid product");
		}
		expect(activeCustomerProduct.internal_entity_id).toBeNull();
		expect(activeCustomerProduct.customer_entitlements).toHaveLength(1);
		expect(activeCustomerProduct.customer_entitlements[0]).toMatchObject({
			balance: 500,
			adjustment: 0,
			entitlement: { pooled: true },
		});

		const check = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
		});
		expect(check.balance).toMatchObject({
			granted: 500,
			remaining: 500,
			usage: 0,
		});
	},
	60_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled field update: direct Expired status removes the source in the same plan")}`,
	async () => {
		const pooledPlan = products.base({
			id: "pooled-direct-status-expiry",
			items: [
				{
					...items.monthlyMessages({ includedUsage: 500 }),
					pooled: true,
				},
			],
		});
		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "pooled-direct-status-expiry",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [pooledPlan] }),
			],
			actions: [s.billing.attach({ productId: pooledPlan.id, entityIndex: 0 })],
		});
		const before = await getPooledTransitionState({ ctx, customerId });
		const sourceCustomerProduct = before.customerProductRows.find(
			(customerProduct) => customerProduct.status === CusProductStatus.Active,
		);
		if (!sourceCustomerProduct) throw new Error("Expected pooled source");

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			customer_product_id: sourceCustomerProduct.id,
			entity_id: entities[0].id,
			status: CusProductStatus.Expired,
			no_billing_changes: true,
		});

		const after = await getPooledTransitionState({ ctx, customerId });
		expect(after.pools).toHaveLength(1);
		expect(after.poolCustomerEntitlements).toHaveLength(1);
		expect(after.poolCustomerEntitlements[0]).toMatchObject({
			adjustment: 0,
			balance: 0,
		});
		expect(after.contributions).toHaveLength(1);
		expect(after.contributions[0]).toMatchObject({
			current_contribution: 0,
			next_cycle_contribution: 0,
		});
		expect(
			after.customerProductRows.find(
				(customerProduct) => customerProduct.id === sourceCustomerProduct.id,
			),
		).toMatchObject({ status: CusProductStatus.Expired });
	},
	60_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled field update: processor relink moves subscription reset provenance")}`,
	async () => {
		const pooledPlan = products.pro({
			id: "pooled-processor-relink",
			items: [
				{
					...items.monthlyMessages({ includedUsage: 500 }),
					pooled: true,
				},
			],
		});
		const { customerId, entities, autumnV2_2, ctx } = await initScenario({
			customerId: "pooled-processor-relink",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [pooledPlan] }),
			],
			actions: [s.billing.attach({ productId: pooledPlan.id, entityIndex: 0 })],
		});
		const before = await getPooledTransitionState({ ctx, customerId });
		const sourceCustomerProduct = before.customerProductRows.find(
			(customerProduct) => customerProduct.status === CusProductStatus.Active,
		);
		if (!sourceCustomerProduct) throw new Error("Expected pooled source");
		const oldSubscriptionId = sourceCustomerProduct.subscription_ids?.[0];
		if (!oldSubscriptionId) throw new Error("Expected a subscription owner");
		const replacementSubscriptionId = `replacement_${oldSubscriptionId}`;

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			customer_product_id: sourceCustomerProduct.id,
			entity_id: entities[0].id,
			processor_subscription_id: replacementSubscriptionId,
			no_billing_changes: true,
		});

		const after = await getPooledTransitionState({ ctx, customerId });
		expect(after.contributions).toHaveLength(1);
		expect(after.contributions[0]).toMatchObject({
			current_contribution: 500,
			next_cycle_contribution: 500,
			reset_owner_id: replacementSubscriptionId,
			reset_owner_type: "subscription",
		});
		expect(
			after.customerProductRows.find(
				(customerProduct) => customerProduct.id === sourceCustomerProduct.id,
			),
		).toMatchObject({ subscription_ids: [replacementSubscriptionId] });
	},
	60_000,
);
