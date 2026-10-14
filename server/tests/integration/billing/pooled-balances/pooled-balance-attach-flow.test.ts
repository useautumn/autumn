import { test } from "bun:test";
import {
	type ApiCustomerV5,
	type AttachParamsV1Input,
	EntInterval,
	PooledBalanceResetMode,
} from "@autumn/shared";
import { expectNoStripeSubscription } from "@tests/integration/billing/utils/expectNoStripeSubscription.js";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect/index.js";
import { expectBalanceCorrect } from "@tests/integration/utils/expectBalanceCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
import { isBalanceWorkerRoute } from "@tests/utils/balanceWorkerRouteTestUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectPooledBalanceCorrect } from "./utils/expectPooledBalanceCorrect.js";
import { getPooledSourceCustomerProduct } from "./utils/getPooledBalanceDbState.js";

const POOLED_GRANT = 500;

type PooledAttachCase = {
	id: string;
	interval: EntInterval;
	paid: boolean;
	resetMode: PooledBalanceResetMode;
};

const runPooledAttachCase = async ({
	pooledAttachCase,
}: {
	pooledAttachCase: PooledAttachCase;
}) => {
	const pooledItem = {
		...(pooledAttachCase.interval === EntInterval.Lifetime
			? items.lifetimeMessages({ includedUsage: POOLED_GRANT })
			: items.monthlyMessages({ includedUsage: POOLED_GRANT })),
		pooled: true,
	};
	const pooledPlan = pooledAttachCase.paid
		? products.pro({
				id: `pooled-${pooledAttachCase.id}`,
				items: [pooledItem],
			})
		: products.base({
				id: `pooled-${pooledAttachCase.id}`,
				items: [pooledItem],
			});
	const privatePlan = products.base({
		id: `private-${pooledAttachCase.id}`,
		items: [
			pooledAttachCase.interval === EntInterval.Lifetime
				? items.lifetimeMessages({ includedUsage: 250 })
				: items.monthlyMessages({ includedUsage: 250 }),
		],
	});
	const customerId = `pooled-attach-${pooledAttachCase.id}`;
	const { entities, autumnV2_2, ctx } = await initScenario({
		customerId,
		setup: [
			s.customer({
				testClock: false,
				...(pooledAttachCase.paid ? { paymentMethod: "success" as const } : {}),
			}),
			s.entities({ count: 3, featureId: TestFeature.Users }),
			s.products({ list: [pooledPlan, privatePlan] }),
		],
		actions: [
			s.billing.attach({ productId: pooledPlan.id, entityIndex: 0 }),
			s.billing.attach({ productId: pooledPlan.id, entityIndex: 1 }),
			s.track({
				featureId: TestFeature.Messages,
				value: 700,
				entityIndex: 2,
				timeout: 2000,
			}),
		],
	});

	const lifecycleExpectation = {
		interval: pooledAttachCase.interval,
		nextResetAt:
			pooledAttachCase.resetMode === PooledBalanceResetMode.Lifetime
				? null
				: ("present" as const),
		resetCycleAnchor:
			pooledAttachCase.resetMode === PooledBalanceResetMode.Lifetime
				? null
				: ("present" as const),
		resetMode: pooledAttachCase.resetMode,
		stripeSubscriptionId:
			pooledAttachCase.resetMode === PooledBalanceResetMode.Subscription
				? ("stripe_subscription" as const)
				: null,
	};
	const before = await expectPooledBalanceCorrect({
		db: ctx.db,
		customerId,
		pool: {
			balance: POOLED_GRANT * 2 - 700,
			adjustment: 0,
			cacheVersion: 1,
			granted: POOLED_GRANT * 2,
			...lifecycleExpectation,
		},
		contributions: {
			count: 2,
			currentContribution: POOLED_GRANT,
			nextCycleContribution: POOLED_GRANT,
		},
		sources: { count: 2, balance: 0, adjustment: 0 },
	});
	const pooledCustomerEntitlement = before.poolCustomerEntitlements[0];
	const outgoingCustomerProduct = getPooledSourceCustomerProduct({
		state: before,
		productId: pooledPlan.id,
		entityId: entities[0].id,
	});

	const customerBeforeRemoval = await autumnV2_2.customers.get<ApiCustomerV5>(
		customerId,
		{
			skip_cache: "true",
		},
	);
	expectBalanceCorrect({
		customer: customerBeforeRemoval,
		featureId: TestFeature.Messages,
		granted: POOLED_GRANT * 2,
		includedGrant: POOLED_GRANT * 2,
		remaining: POOLED_GRANT * 2 - 700,
		usage: 700,
		breakdownCount: 1,
		breakdownId: pooledCustomerEntitlement.id,
	});

	await autumnV2_2.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		entity_id: entities[0].id,
		plan_id: privatePlan.id,
		plan_schedule: "immediate",
	});

	await expectPooledBalanceCorrect({
		db: ctx.db,
		customerId,
		pool: {
			balance: -200,
			adjustment: 0,
			cacheVersion: 2,
			granted: POOLED_GRANT,
			...lifecycleExpectation,
		},
		contributions: {
			count: 1,
			currentContribution: POOLED_GRANT,
			nextCycleContribution: POOLED_GRANT,
			excludedSourceCustomerProductIds: [outgoingCustomerProduct.id],
		},
		sources: { count: 2, balance: 0, adjustment: 0 },
	});

	if (!isBalanceWorkerRoute()) {
		const customerAfterRemoval = await autumnV2_2.customers.get<ApiCustomerV5>(
			customerId,
			{
				skip_cache: "true",
			},
		);
		expectBalanceCorrect({
			customer: customerAfterRemoval,
			featureId: TestFeature.Messages,
			granted: POOLED_GRANT + 250,
			includedGrant: POOLED_GRANT,
			remaining: 250,
			usage: 700,
			breakdownCount: 1,
			breakdownId: pooledCustomerEntitlement.id,
		});
	}

	if (pooledAttachCase.paid) {
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	} else {
		await expectNoStripeSubscription({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	}
};

test.concurrent(
	`${chalk.yellowBright("pooled attach: free-monthly coalesces and removes an outgoing source")}`,
	async () => {
		await runPooledAttachCase({
			pooledAttachCase: {
				id: "free-monthly",
				interval: EntInterval.Month,
				paid: false,
				resetMode: PooledBalanceResetMode.Lazy,
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("pooled attach: lifetime coalesces and removes an outgoing source")}`,
	async () => {
		await runPooledAttachCase({
			pooledAttachCase: {
				id: "lifetime",
				interval: EntInterval.Lifetime,
				paid: false,
				resetMode: PooledBalanceResetMode.Lifetime,
			},
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("pooled attach: paid-monthly coalesces and removes an outgoing source")}`,
	async () => {
		await runPooledAttachCase({
			pooledAttachCase: {
				id: "paid-monthly",
				interval: EntInterval.Month,
				paid: true,
				resetMode: PooledBalanceResetMode.Subscription,
			},
		});
	},
);
