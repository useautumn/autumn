// Pooled Boolean grants form one customer flag backed by zero-valued source contributions.

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type ApiEntityV2,
	type CheckResponseV3,
	EntInterval,
	entitlements,
	PooledBalanceResetMode,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/index.js";
import { expectFlagCorrect } from "@tests/integration/utils/expectFlagCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { eq } from "drizzle-orm";
import { expectPooledBalanceCorrect } from "../utils/expectPooledBalanceCorrect.js";
import {
	getPooledBalanceDbState,
	getPooledSourceCustomerProduct,
} from "../utils/getPooledBalanceDbState.js";

const pooledDashboardItem = () => ({
	...items.dashboard(),
	pooled: true,
});

const booleanPoolLifecycle = {
	interval: EntInterval.Lifetime,
	nextResetAt: null,
	resetCycleAnchor: null,
	resetMode: PooledBalanceResetMode.Lifetime,
	stripeSubscriptionId: null,
} as const;

test.concurrent(
	"pooled boolean sources coalesce into one flag for every entity",
	async () => {
		const customerId = "pooled-boolean-coalesce";
		const plan = products.base({
			id: "pooled-boolean-coalesce-plan",
			items: [pooledDashboardItem()],
		});
		const { autumnV2_2, autumnV2_3, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({ productId: plan.id, entityIndex: 0 }),
				s.billing.attach({ productId: plan.id, entityIndex: 1 }),
			],
		});

		const state = await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: 0,
				adjustment: 0,
				granted: 0,
				unlimited: false,
				customerEntitlementUnlimited: null,
				...booleanPoolLifecycle,
			},
			contributions: {
				count: 2,
				currentContribution: 0,
				nextCycleContribution: 0,
			},
			sources: { count: 2, balance: 0, adjustment: 0 },
		});
		const pooledCustomerEntitlement = state.poolCustomerEntitlements[0];
		expect(state.pools[0]?.rollover_signature).toBe("none");
		const pooledEntitlement = await ctx.db.query.entitlements.findFirst({
			where: eq(entitlements.id, pooledCustomerEntitlement.entitlement_id),
		});
		expect(pooledEntitlement).toMatchObject({
			allowance: null,
			allowance_type: null,
			interval: null,
			rollover: null,
			pooled: true,
		});

		const uncachedCustomer = await autumnV2_2.customers.get<ApiCustomerV5>(
			customerId,
			{
				skip_cache: "true",
			},
		);
		expectFlagCorrect({
			customer: uncachedCustomer,
			featureId: TestFeature.Dashboard,
			planId: null,
		});
		expect(uncachedCustomer.balances[TestFeature.Dashboard]).toBeUndefined();

		const cachedCustomer =
			await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expectFlagCorrect({
			customer: cachedCustomer,
			featureId: TestFeature.Dashboard,
			planId: null,
		});

		for (const entity of entities) {
			const entityResponse = await autumnV2_2.entities.get<ApiEntityV2>(
				customerId,
				entity.id,
			);
			expectFlagCorrect({
				customer: entityResponse,
				featureId: TestFeature.Dashboard,
				planId: null,
			});
		}

		const check = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			entity_id: entities[2].id,
			feature_id: TestFeature.Dashboard,
		});
		expect(check).toMatchObject({
			allowed: true,
			balance: null,
			flag: {
				feature_id: TestFeature.Dashboard,
				plan_id: null,
			},
		});

		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

test.concurrent(
	"pooled boolean flag expires only after its final source is removed",
	async () => {
		const customerId = "pooled-boolean-expiry";
		const plan = products.base({
			id: "pooled-boolean-expiry-plan",
			items: [pooledDashboardItem()],
		});
		const { autumnV2_2, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [plan] }),
			],
			actions: [
				s.billing.attach({ productId: plan.id, entityIndex: 0 }),
				s.billing.attach({ productId: plan.id, entityIndex: 1 }),
			],
		});
		const initial = await getPooledBalanceDbState({ db: ctx.db, customerId });
		const firstSource = getPooledSourceCustomerProduct({
			state: initial,
			productId: plan.id,
			entityId: entities[0].id,
		});
		const secondSource = getPooledSourceCustomerProduct({
			state: initial,
			productId: plan.id,
			entityId: entities[1].id,
		});

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			customer_product_id: firstSource.id,
			entity_id: entities[0].id,
			cancel_action: "cancel_immediately",
		});

		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: 0,
				adjustment: 0,
				granted: 0,
				unlimited: false,
				customerEntitlementUnlimited: null,
				...booleanPoolLifecycle,
			},
			contributions: { count: 1 },
			sources: { count: 2, balance: 0, adjustment: 0 },
		});
		const afterFirstRemoval = await autumnV2_2.customers.get<ApiCustomerV5>(
			customerId,
			{
				skip_cache: "true",
			},
		);
		expectFlagCorrect({
			customer: afterFirstRemoval,
			featureId: TestFeature.Dashboard,
			planId: null,
		});

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			customer_product_id: secondSource.id,
			entity_id: entities[1].id,
			cancel_action: "cancel_immediately",
		});

		const finalState = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(finalState.contributions).toHaveLength(0);
		expect(finalState.poolCustomerEntitlements[0].expires_at).not.toBeNull();
		expect(finalState.pools[0].expires_at).not.toBeNull();

		const afterFinalRemoval = await autumnV2_2.customers.get<ApiCustomerV5>(
			customerId,
			{
				skip_cache: "true",
			},
		);
		expectFlagCorrect({
			customer: afterFinalRemoval,
			featureId: TestFeature.Dashboard,
			present: false,
		});
		const check = await autumnV2_2.check<CheckResponseV3>({
			customer_id: customerId,
			feature_id: TestFeature.Dashboard,
		});
		expect(check.allowed).toBe(false);
	},
);

test.concurrent(
	"paid plans can grant an unpriced pooled boolean feature",
	async () => {
		const customerId = "pooled-boolean-paid";
		const plan = products.pro({
			id: "pooled-boolean-paid-plan",
			items: [pooledDashboardItem()],
		});
		const { autumnV2_2, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id, entityIndex: 0 })],
		});

		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: 0,
				adjustment: 0,
				granted: 0,
				unlimited: false,
				customerEntitlementUnlimited: null,
				...booleanPoolLifecycle,
			},
			contributions: {
				count: 1,
				currentContribution: 0,
				nextCycleContribution: 0,
			},
			sources: { count: 1, balance: 0, adjustment: 0 },
		});
		const entity = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			entities[0].id,
			{ skip_cache: "true" },
		);
		expectFlagCorrect({
			customer: entity,
			featureId: TestFeature.Dashboard,
			planId: null,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);

test.concurrent(
	"disable_pooled_balance hides a pooled boolean flag from entity scope",
	async () => {
		const customerId = "pooled-boolean-disabled";
		const plan = products.base({
			id: "pooled-boolean-disabled-plan",
			items: [pooledDashboardItem()],
		});
		const { autumnV2_2, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({
					testClock: false,
					data: { config: { disable_pooled_balance: true } },
				}),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id, entityIndex: 0 })],
		});

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expectFlagCorrect({
			customer,
			featureId: TestFeature.Dashboard,
			planId: null,
		});
		const entity = await autumnV2_2.entities.get<ApiEntityV2>(
			customerId,
			entities[0].id,
		);
		expectFlagCorrect({
			customer: entity,
			featureId: TestFeature.Dashboard,
			present: false,
		});
	},
);
