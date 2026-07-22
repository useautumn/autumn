/** Server-backed contracts for transferring pooled catalog products between customer and entity scopes. */

import { expect, test } from "bun:test";
import {
	type CheckResponseV3,
	CusProductStatus,
	customerEntitlements,
	customerProducts,
	customers,
	pooledBalanceContributions,
	pooledBalances,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import type { TestContext } from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { eq, inArray } from "drizzle-orm";
import { deleteCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/deleteCachedFullCustomer.js";

const getTransferState = async ({
	ctx,
	customerId,
}: {
	ctx: TestContext;
	customerId: string;
}) => {
	const internalCustomer = await ctx.db.query.customers.findFirst({
		where: eq(customers.id, customerId),
	});
	if (!internalCustomer) throw new Error(`Customer '${customerId}' not found`);

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
		poolCustomerEntitlements,
		pools,
	};
};

const pooledPlan = ({ id }: { id: string }) =>
	products.base({
		id,
		items: [
			{
				...items.monthlyMessages({ includedUsage: 500 }),
				pooled: true,
			},
		],
	});

test.concurrent(
	`${chalk.yellowBright("pooled transfer: customer to entity carries ordinary usage into the managed pool")}`,
	async () => {
		const plan = pooledPlan({ id: "pooled-transfer-customer-to-entity" });
		const { customerId, entities, autumnV1, autumnV2_2, ctx } =
			await initScenario({
				customerId: "pooled-transfer-customer-to-entity",
				setup: [
					s.customer({ testClock: false }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
					s.products({ list: [plan] }),
				],
				actions: [
					s.billing.attach({ productId: plan.id }),
					s.track({
						featureId: TestFeature.Messages,
						value: 200,
						timeout: 2000,
					}),
				],
			});

		await autumnV1.transfer(customerId, {
			to_entity_id: entities[0].id,
			product_id: plan.id,
		});

		const state = await getTransferState({ ctx, customerId });
		expect(state.pools).toHaveLength(1);
		expect(state.poolCustomerEntitlements).toHaveLength(1);
		expect(state.poolCustomerEntitlements[0]).toMatchObject({
			adjustment: 500,
			balance: 300,
		});
		const transferredCustomerProduct = state.customerProductRows.find(
			(customerProduct) => customerProduct.status === CusProductStatus.Active,
		);
		if (!transferredCustomerProduct) {
			throw new Error("Expected an active transferred customer product");
		}
		expect(transferredCustomerProduct).toMatchObject({
			entity_id: entities[0].id,
			quantity: 1,
		});
		expect(transferredCustomerProduct.customer_entitlements[0]).toMatchObject({
			balance: 0,
			adjustment: 0,
			additional_balance: 0,
		});
		expect(state.contributions).toHaveLength(1);
		expect(state.contributions[0]).toMatchObject({
			source_customer_product_id: transferredCustomerProduct.id,
			current_contribution: 500,
			next_cycle_contribution: 500,
		});

		const siblingCheck = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
		});
		expect(siblingCheck.balance).toMatchObject({
			granted: 500,
			remaining: 300,
			usage: 200,
		});
	},
	60_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled transfer: entity to customer leaves history on the tombstone and creates a fresh grant")}`,
	async () => {
		const plan = pooledPlan({ id: "pooled-transfer-entity-to-customer" });
		const { customerId, entities, autumnV1, ctx } = await initScenario({
			customerId: "pooled-transfer-entity-to-customer",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({ productId: plan.id, entityIndex: 0 }),
				s.track({
					featureId: TestFeature.Messages,
					value: 400,
					entityIndex: 1,
					timeout: 2000,
				}),
			],
		});

		await autumnV1.transfer(customerId, {
			from_entity_id: entities[0].id,
			product_id: plan.id,
		});

		const state = await getTransferState({ ctx, customerId });
		expect(state.pools).toHaveLength(1);
		expect(state.poolCustomerEntitlements[0]).toMatchObject({
			customer_product_id: null,
			adjustment: 0,
			balance: -400,
		});
		const customerProduct = state.customerProductRows.find(
			(candidate) => candidate.status === CusProductStatus.Active,
		);
		if (!customerProduct) {
			throw new Error("Expected a customer-level transferred product");
		}
		expect(customerProduct).toMatchObject({
			entity_id: null,
			internal_entity_id: null,
			quantity: 1,
		});
		expect(customerProduct.customer_entitlements[0]).toMatchObject({
			balance: 500,
			adjustment: 0,
			additional_balance: 0,
		});
		expect(state.contributions).toHaveLength(1);
		expect(state.contributions[0]).toMatchObject({
			source_customer_product_id: customerProduct.id,
			current_contribution: 0,
			next_cycle_contribution: 0,
		});
	},
	60_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled transfer: entity to customer to entity reapplies ordinary-phase usage on the same product")}`,
	async () => {
		const plan = pooledPlan({ id: "pooled-transfer-round-trip" });
		const { customerId, entities, autumnV1, autumnV2_2, ctx } =
			await initScenario({
				customerId: "pooled-transfer-round-trip",
				setup: [
					s.customer({ testClock: false }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
					s.products({ list: [plan] }),
				],
				actions: [s.billing.attach({ productId: plan.id, entityIndex: 0 })],
			});

		await autumnV1.transfer(customerId, {
			from_entity_id: entities[0].id,
			product_id: plan.id,
		});
		const ordinaryState = await getTransferState({ ctx, customerId });
		const sourceCustomerProduct = ordinaryState.customerProductRows.find(
			(customerProduct) => customerProduct.status === CusProductStatus.Active,
		);
		if (!sourceCustomerProduct) {
			throw new Error("Expected a customer-level product between transfers");
		}

		await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 200,
		});
		await autumnV1.transfer(customerId, {
			to_entity_id: entities[1].id,
			product_id: plan.id,
		});

		const managedState = await getTransferState({ ctx, customerId });
		expect(managedState.customerProductRows).toHaveLength(1);
		expect(managedState.customerProductRows[0]).toMatchObject({
			id: sourceCustomerProduct.id,
			entity_id: entities[1].id,
		});
		expect(managedState.contributions).toHaveLength(1);
		expect(managedState.contributions[0]).toMatchObject({
			source_customer_product_id: sourceCustomerProduct.id,
			current_contribution: 500,
			next_cycle_contribution: 500,
		});
		expect(managedState.poolCustomerEntitlements[0]).toMatchObject({
			adjustment: 500,
			balance: 300,
		});

		const siblingCheck = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[0].id,
			feature_id: TestFeature.Messages,
		});
		expect(siblingCheck.balance).toMatchObject({
			granted: 500,
			remaining: 300,
			usage: 200,
		});
	},
	60_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled transfer: entity to entity changes ownership without changing pooled state")}`,
	async () => {
		const plan = pooledPlan({ id: "pooled-transfer-entity-to-entity" });
		const { customerId, entities, autumnV1, ctx } = await initScenario({
			customerId: "pooled-transfer-entity-to-entity",
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({ productId: plan.id, entityIndex: 0 }),
				s.track({
					featureId: TestFeature.Messages,
					value: 200,
					entityIndex: 1,
					timeout: 2000,
				}),
			],
		});
		const before = await getTransferState({ ctx, customerId });

		await autumnV1.transfer(customerId, {
			from_entity_id: entities[0].id,
			to_entity_id: entities[2].id,
			product_id: plan.id,
		});

		const after = await getTransferState({ ctx, customerId });
		expect(after.customerProductRows).toHaveLength(1);
		expect(after.customerProductRows[0]).toMatchObject({
			entity_id: entities[2].id,
			quantity: 1,
		});
		expect(after.pools).toEqual(before.pools);
		expect(after.poolCustomerEntitlements).toEqual(
			before.poolCustomerEntitlements,
		);
		expect(after.contributions).toEqual(before.contributions);
	},
	60_000,
);

test.concurrent(
	`${chalk.yellowBright("pooled transfer: entity to customer quantity split keeps pool debt and inserts a fresh ordinary unit")}`,
	async () => {
		const plan = pooledPlan({ id: "pooled-transfer-quantity-split" });
		const { customerId, entities, autumnV1, autumnV2_2, ctx } =
			await initScenario({
				customerId: "pooled-transfer-quantity-split",
				setup: [
					s.customer({ testClock: false }),
					s.entities({ count: 2, featureId: TestFeature.Users }),
					s.products({ list: [plan] }),
				],
				actions: [s.billing.attach({ productId: plan.id, entityIndex: 0 })],
			});
		const initial = await getTransferState({ ctx, customerId });
		const sourceCustomerProduct = initial.customerProductRows[0];
		const pool = initial.pools[0];
		const contribution = initial.contributions[0];
		if (!sourceCustomerProduct || !pool || !contribution) {
			throw new Error("Expected an initial managed pooled source");
		}

		await ctx.db.transaction(async (transaction) => {
			await transaction
				.update(customerProducts)
				.set({ quantity: 3 })
				.where(eq(customerProducts.id, sourceCustomerProduct.id));
			await transaction
				.update(pooledBalanceContributions)
				.set({
					current_contribution: 1500,
					next_cycle_contribution: 1500,
				})
				.where(eq(pooledBalanceContributions.id, contribution.id));
			await transaction
				.update(customerEntitlements)
				.set({ adjustment: 1500, balance: 1500 })
				.where(eq(customerEntitlements.id, pool.customer_entitlement_id));
		});
		await deleteCachedFullCustomer({
			ctx,
			customerId,
			source: "pooled-transfer-quantity-split-setup",
			flushBalances: false,
		});
		await autumnV2_2.track({
			customer_id: customerId,
			entity_id: entities[1].id,
			feature_id: TestFeature.Messages,
			value: 1200,
		});

		await autumnV1.transfer(customerId, {
			from_entity_id: entities[0].id,
			product_id: plan.id,
		});

		const after = await getTransferState({ ctx, customerId });
		const remainingSource = after.customerProductRows.find(
			(customerProduct) => customerProduct.entity_id === entities[0].id,
		);
		const transferredUnit = after.customerProductRows.find(
			(customerProduct) => customerProduct.entity_id === null,
		);
		expect(remainingSource).toMatchObject({ quantity: 2 });
		expect(transferredUnit).toMatchObject({ quantity: 1 });
		expect(transferredUnit?.customer_entitlements[0]).toMatchObject({
			balance: 500,
			adjustment: 0,
			additional_balance: 0,
		});
		expect(after.poolCustomerEntitlements[0]).toMatchObject({
			adjustment: 1000,
			balance: -200,
		});
		const remainingContribution = after.contributions.find(
			(candidate) =>
				candidate.source_customer_product_id === remainingSource?.id,
		);
		expect(remainingContribution).toMatchObject({
			current_contribution: 1000,
			next_cycle_contribution: 1000,
		});
		expect(
			after.contributions.some(
				(candidate) =>
					candidate.source_customer_product_id === transferredUnit?.id,
			),
		).toBe(false);
	},
	60_000,
);
