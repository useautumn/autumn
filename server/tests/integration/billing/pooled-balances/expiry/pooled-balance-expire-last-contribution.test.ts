import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type CheckResponseV3,
	EntInterval,
	PooledBalanceResetMode,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { expectPooledBalanceCorrect } from "../utils/expectPooledBalanceCorrect.js";
import { getPooledBalanceDbState } from "../utils/getPooledBalanceDbState.js";

const SOLE_GRANT = 100;
const SECOND_GRANT = 60;

const LAZY_POOL_LIFECYCLE = {
	interval: EntInterval.Month,
	nextResetAt: "present",
	resetCycleAnchor: "present",
	resetMode: PooledBalanceResetMode.Lazy,
	stripeSubscriptionId: null,
} as const;

const pooledPlan = ({
	id,
	group,
	grant,
}: {
	id: string;
	group: string;
	grant: number;
}) =>
	products.base({
		id,
		group,
		items: [
			{ ...items.monthlyMessages({ includedUsage: grant }), pooled: true },
		],
	});

type ScenarioClients = Awaited<ReturnType<typeof initScenario>>;

const expectPooledFeatureHidden = async ({
	autumnV2_3,
	customerId,
}: {
	autumnV2_3: ScenarioClients["autumnV2_3"];
	customerId: string;
}) => {
	const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
	expect(customer.balances?.[TestFeature.Messages]).toBeUndefined();

	const check = await autumnV2_3.check<CheckResponseV3>({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
	});
	expect(check.allowed).toBe(false);
};

test(
	chalk.yellowBright(
		"pooled expiry: expiring the sole contributing plan expires the pooled entitlement",
	),
	async () => {
		const customerId = "pooled-expire-sole-contribution";
		const plan = pooledPlan({
			id: "pooled-expire-sole-plan",
			group: "pooled-expire-sole-group",
			grant: SOLE_GRANT,
		});

		const { entities, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id, entityIndex: 0 })],
		});

		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: SOLE_GRANT,
				adjustment: 0,
				granted: SOLE_GRANT,
				...LAZY_POOL_LIFECYCLE,
			},
			contributions: { count: 1 },
			sources: { count: 1, balance: 0, adjustment: 0 },
		});

		await autumnV2_3.subscriptions.update({
			customer_id: customerId,
			product_id: plan.id,
			entity_id: entities[0].id,
			cancel_action: "cancel_immediately",
		});

		const afterExpiry = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(afterExpiry.contributions).toHaveLength(0);
		expect(afterExpiry.pools).toHaveLength(1);
		expect(afterExpiry.poolCustomerEntitlements).toHaveLength(1);

		const pooledCustomerEntitlement = afterExpiry.poolCustomerEntitlements[0];
		expect(pooledCustomerEntitlement.expires_at).not.toBeNull();
		expect(pooledCustomerEntitlement.expires_at).toBeLessThanOrEqual(
			Date.now(),
		);

		await expectPooledFeatureHidden({ autumnV2_3, customerId });
	},
);

test(
	chalk.yellowBright(
		"pooled expiry: expiring one of several contributors leaves the pool live",
	),
	async () => {
		const customerId = "pooled-expire-one-of-many";
		const group = "pooled-expire-many-group";
		const firstPlan = pooledPlan({
			id: "pooled-expire-many-first",
			group,
			grant: SOLE_GRANT,
		});
		const secondPlan = pooledPlan({
			id: "pooled-expire-many-second",
			group,
			grant: SECOND_GRANT,
		});

		const { entities, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
				s.products({ list: [firstPlan, secondPlan] }),
			],
			actions: [
				s.billing.attach({ productId: firstPlan.id, entityIndex: 0 }),
				s.billing.attach({ productId: secondPlan.id, entityIndex: 1 }),
			],
		});

		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: SOLE_GRANT + SECOND_GRANT,
				adjustment: 0,
				granted: SOLE_GRANT + SECOND_GRANT,
				...LAZY_POOL_LIFECYCLE,
			},
			contributions: { count: 2 },
			sources: { count: 2, balance: 0, adjustment: 0 },
		});

		await autumnV2_3.subscriptions.update({
			customer_id: customerId,
			product_id: firstPlan.id,
			entity_id: entities[0].id,
			cancel_action: "cancel_immediately",
		});

		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: SECOND_GRANT,
				adjustment: 0,
				granted: SECOND_GRANT,
				...LAZY_POOL_LIFECYCLE,
			},
			contributions: { count: 1 },
			sources: { count: 2, balance: 0, adjustment: 0 },
		});

		const afterExpiry = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(afterExpiry.poolCustomerEntitlements[0].expires_at).toBeNull();
	},
);

test(
	chalk.yellowBright(
		"pooled expiry: a customer-scoped sole contributor expires the pool too",
	),
	async () => {
		const customerId = "pooled-expire-customer-level";
		const plan = pooledPlan({
			id: "pooled-expire-customer-level-plan",
			group: "pooled-expire-customer-level-group",
			grant: SOLE_GRANT,
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.billing.attach({ productId: plan.id })],
		});

		await expectPooledBalanceCorrect({
			db: ctx.db,
			customerId,
			pool: {
				balance: SOLE_GRANT,
				adjustment: 0,
				granted: SOLE_GRANT,
				...LAZY_POOL_LIFECYCLE,
			},
			contributions: { count: 1 },
			sources: { count: 1, balance: 0, adjustment: 0 },
		});

		await autumnV2_3.subscriptions.update({
			customer_id: customerId,
			product_id: plan.id,
			cancel_action: "cancel_immediately",
		});

		const afterExpiry = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(afterExpiry.contributions).toHaveLength(0);
		expect(afterExpiry.poolCustomerEntitlements[0].expires_at).not.toBeNull();

		await expectPooledFeatureHidden({ autumnV2_3, customerId });
	},
);

test(
	chalk.yellowBright(
		"pooled expiry: re-attaching after expiry mints a fresh pool and keeps the old one",
	),
	async () => {
		const customerId = "pooled-expire-then-reattach";
		const plan = pooledPlan({
			id: "pooled-expire-reattach-plan",
			group: "pooled-expire-reattach-group",
			grant: SOLE_GRANT,
		});

		const { entities, autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
				s.products({ list: [plan] }),
			],
			actions: [s.billing.attach({ productId: plan.id, entityIndex: 0 })],
		});

		const initial = await getPooledBalanceDbState({ db: ctx.db, customerId });
		expect(initial.pools).toHaveLength(1);
		const originalPoolId = initial.pools[0].id;

		await autumnV2_3.subscriptions.update({
			customer_id: customerId,
			product_id: plan.id,
			entity_id: entities[0].id,
			cancel_action: "cancel_immediately",
		});

		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: plan.id,
			entity_id: entities[0].id,
		});

		const afterReattach = await getPooledBalanceDbState({
			db: ctx.db,
			customerId,
		});
		expect(afterReattach.pools).toHaveLength(2);

		const expiredPool = afterReattach.pools.find(
			(pool) => pool.id === originalPoolId,
		);
		const freshPool = afterReattach.pools.find(
			(pool) => pool.id !== originalPoolId,
		);
		if (!(expiredPool && freshPool)) {
			throw new Error("expected the expired pool alongside a fresh one");
		}

		expect(expiredPool.expires_at).not.toBeNull();
		expect(freshPool.expires_at).toBeNull();
		expect(freshPool.granted).toBe(SOLE_GRANT);

		expect(afterReattach.contributions).toHaveLength(1);
		expect(afterReattach.contributions[0].pooled_balance_id).toBe(freshPool.id);
	},
);
