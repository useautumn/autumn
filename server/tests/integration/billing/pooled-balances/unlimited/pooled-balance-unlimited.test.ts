/** Unlimited pooled sources share a zero-valued synthetic entitlement. */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	EntInterval,
	PooledBalanceResetMode,
	ProductItemInterval,
	ResetInterval,
	type SyncParamsV1,
	type TrackResponseV2,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/index.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { timeout } from "@tests/utils/genUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { expectPooledBalanceCorrect } from "../utils/expectPooledBalanceCorrect.js";
import {
	getPooledBalanceDbState,
	getPooledSourceCustomerProduct,
} from "../utils/getPooledBalanceDbState.js";

const unlimitedItem = ({
	interval,
}: {
	interval?: ProductItemInterval;
} = {}) => ({
	...items.unlimitedMessages(),
	pooled: true,
	...(interval ? { interval } : {}),
});

const unlimitedLifecycle = {
	interval: EntInterval.Lifetime,
	nextResetAt: null,
	resetCycleAnchor: null,
	resetMode: PooledBalanceResetMode.Lifetime,
	stripeSubscriptionId: null,
} as const;

test.concurrent(
	"unlimited pooled sources coalesce and tracking leaves the graph unchanged",
	async () => {
		const customerId = "pooled-unlimited-coalesce";
		const plan = products.base({
			id: "pooled-unlimited-coalesce-plan",
			items: [unlimitedItem()],
		});
		const { autumnV2_2, ctx } = await initScenario({
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

		const before = await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: 0,
				adjustment: 0,
				cacheVersion: 0,
				granted: 0,
				unlimited: true,
				...unlimitedLifecycle,
			},
			contributions: {
				count: 2,
				currentContribution: 0,
				nextCycleContribution: 0,
			},
			sources: { count: 2, balance: 0, adjustment: 0 },
		});

		const trackResponse: TrackResponseV2 = await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1_000_000,
		});
		expect(trackResponse.balance).toMatchObject({
			unlimited: true,
			remaining: 0,
			usage: 0,
		});

		const after = await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: 0,
				adjustment: 0,
				cacheVersion: 0,
				granted: 0,
				unlimited: true,
				...unlimitedLifecycle,
			},
			contributions: { count: 2 },
			sources: { count: 2, balance: 0, adjustment: 0 },
		});
		expect(after.poolCustomerEntitlements[0].id).toBe(
			before.poolCustomerEntitlements[0].id,
		);

		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			unlimited: true,
			granted: 0,
			remaining: 0,
			usage: 0,
		});
	},
);

test.concurrent(
	"removing one unlimited pooled source keeps the shared pool live",
	async () => {
		const customerId = "pooled-unlimited-remove-one";
		const plan = products.base({
			id: "pooled-unlimited-remove-one-plan",
			items: [unlimitedItem()],
		});
		const { entities, autumnV2_2, ctx } = await initScenario({
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
		const before = await getPooledBalanceDbState({ db: ctx.db, customerId });
		const outgoing = getPooledSourceCustomerProduct({
			state: before,
			productId: plan.id,
			entityId: entities[0].id,
		});

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			customer_product_id: outgoing.id,
			entity_id: entities[0].id,
			cancel_action: "cancel_immediately",
		});

		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: 0,
				adjustment: 0,
				cacheVersion: 0,
				granted: 0,
				unlimited: true,
				...unlimitedLifecycle,
			},
			contributions: { count: 1 },
			sources: { count: 2, balance: 0, adjustment: 0 },
		});
	},
);

test.concurrent(
	"removing the final unlimited pooled source expires the pool",
	async () => {
		const customerId = "pooled-unlimited-remove-final";
		const plan = products.base({
			id: "pooled-unlimited-remove-final-plan",
			items: [unlimitedItem()],
		});
		const { entities, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id, entityIndex: 0 })],
		});
		const before = await getPooledBalanceDbState({ db: ctx.db, customerId });
		const outgoing = getPooledSourceCustomerProduct({
			state: before,
			productId: plan.id,
			entityId: entities[0].id,
		});

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			customer_product_id: outgoing.id,
			entity_id: entities[0].id,
			cancel_action: "cancel_immediately",
		});

		const state = await getPooledBalanceDbState({ db: ctx.db, customerId });
		expect(state.contributions).toHaveLength(0);
		expect(state.poolCustomerEntitlements[0].expires_at).not.toBeNull();
		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId, {
			skip_cache: "true",
		});
		expect(customer.balances[TestFeature.Messages]).toBeUndefined();
	},
);

const initMixedScenario = async ({ customerId }: { customerId: string }) => {
	const finitePlan = products.base({
		id: `${customerId}-finite`,
		items: [
			{
				...items.monthlyMessages({ includedUsage: 100 }),
				pooled: true,
			},
		],
	});
	const unlimitedPlan = products.base({
		id: `${customerId}-unlimited`,
		isAddOn: true,
		items: [unlimitedItem()],
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
			s.products({ list: [finitePlan, unlimitedPlan] }),
		],
		actions: [
			s.billing.attach({ productId: finitePlan.id, entityIndex: 0 }),
			s.billing.attach({ productId: unlimitedPlan.id, entityIndex: 1 }),
		],
	});
	return { ...scenario, finitePlan, unlimitedPlan };
};

test.concurrent(
	"unlimited and finite pools coexist without consuming the finite pool",
	async () => {
		const customerId = "pooled-unlimited-coexists";
		const { autumnV2_2, ctx } = await initMixedScenario({ customerId });
		const before = await getPooledBalanceDbState({ db: ctx.db, customerId });
		const livePools = before.pools.filter((pool) => pool.expires_at === null);
		expect(livePools).toHaveLength(2);
		expect(livePools.find((pool) => pool.unlimited)).toMatchObject({
			granted: 0,
		});
		expect(livePools.find((pool) => !pool.unlimited)).toMatchObject({
			granted: 100,
		});
		const finiteCusEnt = before.poolCustomerEntitlements.find(
			(cusEnt) =>
				cusEnt.pooled_balance_id ===
				livePools.find((pool) => !pool.unlimited)?.id,
		);
		expect(finiteCusEnt?.balance).toBe(100);

		const trackResponse: TrackResponseV2 = await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 1_000_000,
		});
		expect(trackResponse.balance?.unlimited).toBe(true);

		const after = await getPooledBalanceDbState({ db: ctx.db, customerId });
		expect(
			after.poolCustomerEntitlements.find(
				(cusEnt) => cusEnt.id === finiteCusEnt?.id,
			)?.balance,
		).toBe(100);
	},
);

test.concurrent(
	"finite usage resumes after the final unlimited source is removed",
	async () => {
		const customerId = "pooled-unlimited-resume-finite";
		const { entities, autumnV2_2, ctx, unlimitedPlan } =
			await initMixedScenario({ customerId });
		const before = await getPooledBalanceDbState({ db: ctx.db, customerId });
		const outgoing = getPooledSourceCustomerProduct({
			state: before,
			productId: unlimitedPlan.id,
			entityId: entities[1].id,
		});

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			customer_product_id: outgoing.id,
			entity_id: entities[1].id,
			cancel_action: "cancel_immediately",
		});
		const trackResponse: TrackResponseV2 = await autumnV2_2.track({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			value: 40,
		});
		expect(trackResponse.balance).toMatchObject({
			unlimited: false,
			remaining: 60,
			usage: 40,
		});
		await timeout(2000);

		const state = await getPooledBalanceDbState({ db: ctx.db, customerId });
		const livePools = state.pools.filter((pool) => pool.expires_at === null);
		expect(livePools).toHaveLength(1);
		expect(livePools[0]).toMatchObject({ unlimited: false, granted: 100 });
		const customer = await autumnV2_2.customers.get<ApiCustomerV5>(customerId);
		expect(customer.balances[TestFeature.Messages]).toMatchObject({
			unlimited: false,
			granted: 100,
			remaining: 60,
			usage: 40,
		});
	},
);

for (const lifecycleCase of [
	{
		id: "free-monthly",
		paid: false,
		resetMode: PooledBalanceResetMode.Lazy,
	},
	{
		id: "paid-monthly",
		paid: true,
		resetMode: PooledBalanceResetMode.Subscription,
	},
] as const) {
	test.concurrent(
		`unlimited ${lifecycleCase.id} pools never reset`,
		async () => {
			const customerId = `pooled-unlimited-${lifecycleCase.id}-lifecycle`;
			const planArgs = {
				id: `${customerId}-plan`,
				items: [unlimitedItem({ interval: ProductItemInterval.Month })],
			};
			const plan = lifecycleCase.paid
				? products.pro(planArgs)
				: products.base(planArgs);
			const { ctx } = await initScenario({
				customerId,
				setup: [
					s.customer({
						testClock: lifecycleCase.paid,
						...(lifecycleCase.paid
							? { paymentMethod: "success" as const }
							: {}),
					}),
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
					unlimited: true,
					interval: EntInterval.Month,
					nextResetAt: null,
					resetCycleAnchor: null,
					resetMode: lifecycleCase.resetMode,
					stripeSubscriptionId: lifecycleCase.paid
						? "stripe_subscription"
						: null,
				},
				contributions: {
					count: 1,
					currentContribution: 0,
					nextCycleContribution: 0,
				},
				sources: { count: 1, balance: 0, adjustment: 0 },
			});
			if (lifecycleCase.paid) {
				await expectStripeSubscriptionCorrect({ ctx, customerId });
			}
		},
	);
}

test.concurrent(
	"customizing a finite pooled source to unlimited moves it to a new identity",
	async () => {
		const customerId = "pooled-unlimited-customize";
		const plan = products.base({
			id: "pooled-unlimited-customize-plan",
			items: [
				{
					...items.monthlyMessages({ includedUsage: 100 }),
					pooled: true,
				},
			],
		});
		const { entities, autumnV2_2, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id, entityIndex: 0 })],
		});
		const before = await getPooledBalanceDbState({ db: ctx.db, customerId });
		const source = getPooledSourceCustomerProduct({
			state: before,
			productId: plan.id,
			entityId: entities[0].id,
		});

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			customer_product_id: source.id,
			entity_id: entities[0].id,
			customize: {
				items: [
					{
						feature_id: TestFeature.Messages,
						unlimited: true,
						pooled: true,
					},
				],
			},
		});

		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: 0,
				adjustment: 0,
				granted: 0,
				unlimited: true,
				...unlimitedLifecycle,
			},
			contributions: {
				count: 1,
				currentContribution: 0,
				nextCycleContribution: 0,
			},
			sources: { count: 2, balance: 0, adjustment: 0 },
		});
		const state = await getPooledBalanceDbState({ db: ctx.db, customerId });
		expect(
			state.pools.some((pool) => !pool.unlimited && pool.expires_at !== null),
		).toBe(true);
		const unlimitedSourceId =
			state.contributions[0]?.source_customer_product_id;
		if (!unlimitedSourceId) {
			throw new Error("Expected the unlimited source contribution");
		}

		await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			customer_product_id: unlimitedSourceId,
			entity_id: entities[0].id,
			customize: {
				items: [
					{
						feature_id: TestFeature.Messages,
						included: 100,
						pooled: true,
						reset: { interval: ResetInterval.Month },
					},
				],
			},
		});

		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: 100,
				adjustment: 0,
				granted: 100,
				unlimited: false,
				interval: EntInterval.Month,
				nextResetAt: "present",
				resetCycleAnchor: "present",
				resetMode: PooledBalanceResetMode.Lazy,
				stripeSubscriptionId: null,
			},
			contributions: {
				count: 1,
				currentContribution: 100,
				nextCycleContribution: 100,
			},
			sources: { count: 3, balance: 0, adjustment: 0 },
		});
		const reverted = await getPooledBalanceDbState({ db: ctx.db, customerId });
		expect(
			reverted.pools.some((pool) => pool.unlimited && pool.expires_at !== null),
		).toBe(true);
	},
);

test.concurrent("sync restores an unlimited pooled source", async () => {
	const customerId = "pooled-unlimited-sync";
	const plan = products.pro({
		id: "pooled-unlimited-sync-plan",
		items: [unlimitedItem({ interval: ProductItemInterval.Month })],
	});
	const { entities, autumnV1, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.entities({ count: 1, featureId: TestFeature.Users }),
			s.products({ list: [plan] }),
		],
		actions: [s.billing.attach({ productId: plan.id, entityIndex: 0 })],
	});
	const initial = await getPooledBalanceDbState({ db: ctx.db, customerId });
	const source = getPooledSourceCustomerProduct({
		state: initial,
		productId: plan.id,
		entityId: entities[0].id,
	});
	const stripeSubscriptionId = source.subscription_ids?.[0];
	if (!stripeSubscriptionId) throw new Error("Expected a Stripe subscription");

	await autumnV2_2.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		customer_product_id: source.id,
		entity_id: entities[0].id,
		cancel_action: "cancel_immediately",
		no_billing_changes: true,
	});
	await autumnV1.post("/billing.sync_v2", {
		customer_id: customerId,
		stripe_subscription_id: stripeSubscriptionId,
		phases: [
			{
				starts_at: "now",
				plans: [{ plan_id: plan.id, entity_id: entities[0].id }],
			},
		],
	} satisfies SyncParamsV1);

	await expectPooledBalanceCorrect({
		db: ctx.db,
		customerId,
		pool: {
			balance: 0,
			adjustment: 0,
			granted: 0,
			unlimited: true,
			interval: EntInterval.Month,
			nextResetAt: null,
			resetCycleAnchor: null,
			resetMode: PooledBalanceResetMode.Subscription,
			stripeSubscriptionId: "stripe_subscription",
		},
		contributions: {
			count: 1,
			currentContribution: 0,
			nextCycleContribution: 0,
			excludedSourceCustomerProductIds: [source.id],
		},
		sources: { count: 2, balance: 0, adjustment: 0 },
	});
});
