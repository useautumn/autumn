import { describe, expect, test } from "bun:test";
import {
	AllowanceType,
	EntInterval,
	type EntitlementWithFeature,
	FeatureType,
	FeatureUsageType,
	type FullCusProduct,
	type FullCustomer,
	PooledBalanceResetMode,
} from "@autumn/shared";
import { entities } from "@tests/utils/fixtures/db/entities";
import { entitlements } from "@tests/utils/fixtures/db/entitlements";
import { products } from "@tests/utils/fixtures/db/products";
import { computePooledBalanceTransitionPlan } from "@/internal/billing/v2/pooledBalances/compute/computePooledBalanceTransitionPlan";
import { applyPooledBalancePlanToFullCustomer } from "@/internal/billing/v2/utils/billingPlan/applyPooledBalancePlanToFullCustomer";
import {
	ctx,
	customerWithPools,
	entityA,
	entityB,
	entityRow,
	NOW,
	pooledCreditsPlan,
} from "../set-plans/balances/pooledCreditsFixtures";

const entityC = entities.create({ id: "ent_c", featureId: "users" });

const CREDITS_CONFIG = {
	schema: [{ credit_amount: 1, metered_feature_id: "messages" }],
	usage_type: FeatureUsageType.Single,
};

const paidPlan = pooledCreditsPlan({ planId: "pro", pooledAllowance: 100 });

/** Pooled unlimited credits, on a monthly cycle or (with no interval) for life. */
const unlimitedCredits = ({
	id,
	interval,
}: {
	id: string;
	interval: EntInterval | null;
}): EntitlementWithFeature => ({
	...entitlements.create({
		id,
		featureId: "credits",
		featureName: "Credits",
		featureType: FeatureType.CreditSystem,
		featureConfig: CREDITS_CONFIG,
		interval,
		allowance: 0,
	}),
	allowance: null,
	allowance_type: AllowanceType.Unlimited,
	pooled: true,
});

/** A granted plan (no prices, no subscription) carrying pooled unlimited credits. */
const unlimitedGrantProduct = ({
	planId,
	interval,
}: {
	planId: string;
	interval: EntInterval | null;
}) =>
	products.createFull({
		id: planId,
		prices: [],
		entitlements: [
			unlimitedCredits({ id: `ent_credits_unlimited_${planId}`, interval }),
		],
	});

const monthlyUnlimited = unlimitedGrantProduct({
	planId: "unlimited_monthly",
	interval: EntInterval.Month,
});
const lifetimeUnlimited = unlimitedGrantProduct({
	planId: "unlimited_lifetime",
	interval: null,
});

const paidRow = ({
	rowId = "cp_paid",
	entity = entityA,
}: {
	rowId?: string;
	entity?: typeof entityA;
} = {}): FullCusProduct => ({
	...entityRow({ product: paidPlan.product, entity, rowId }),
	subscription_ids: ["sub_live"],
});

const unlimitedRow = ({
	rowId = "cp_unlimited",
	entity = entityB,
	product = monthlyUnlimited,
}: {
	rowId?: string;
	entity?: typeof entityB;
	product?: typeof monthlyUnlimited;
} = {}): FullCusProduct => ({
	...entityRow({ product, entity, rowId }),
	subscription_ids: [],
	customer_prices: [],
});

const transition = ({
	fullCustomer,
	incoming = [],
	outgoing = [],
}: {
	fullCustomer: FullCustomer;
	incoming?: FullCusProduct[];
	outgoing?: FullCusProduct[];
}) => {
	const heldIds = new Set(fullCustomer.customer_products.map(({ id }) => id));
	fullCustomer.customer_products = [
		...fullCustomer.customer_products,
		...incoming.filter(({ id }) => !heldIds.has(id)),
	];
	const { pooledBalancePlan } = computePooledBalanceTransitionPlan({
		ctx,
		fullCustomer,
		incomingCustomerProducts: incoming,
		outgoingCustomerProducts: outgoing,
		now: NOW,
	});
	applyPooledBalancePlanToFullCustomer({ fullCustomer, pooledBalancePlan });
	const outgoingIds = new Set(outgoing.map(({ id }) => id));
	fullCustomer.customer_products = fullCustomer.customer_products.filter(
		({ id }) => !outgoingIds.has(id),
	);
	return pooledBalancePlan;
};

/** The pooled credits contribution a customer product currently holds. */
const contributionOf = ({
	fullCustomer,
	rowId,
}: {
	fullCustomer: FullCustomer;
	rowId: string;
}) =>
	fullCustomer.customer_products
		.find(({ id }) => id === rowId)
		?.customer_entitlements.find(
			({ entitlement }) =>
				entitlement.pooled && entitlement.id !== "ent_credits_overage",
		)?.pooled_balance_contribution;

const poolIdOf = (args: { fullCustomer: FullCustomer; rowId: string }) =>
	contributionOf(args)?.pooled_balance_id;

const poolById = ({
	fullCustomer,
	poolId,
}: {
	fullCustomer: FullCustomer;
	poolId?: string;
}) =>
	(fullCustomer.pooled_customer_entitlements ?? []).find(
		(customerEntitlement) => customerEntitlement.pooled_balance?.id === poolId,
	);

/** Pools some customer product still feeds; emptied pools are expired at execution. */
const livePoolIds = (fullCustomer: FullCustomer) =>
	new Set(
		fullCustomer.customer_products.flatMap((customerProduct) =>
			customerProduct.customer_entitlements.flatMap(
				(customerEntitlement) =>
					customerEntitlement.pooled_balance_contribution?.pooled_balance_id ??
					[],
			),
		),
	);

const onlyLivePool = (fullCustomer: FullCustomer) => {
	const poolIds = [...livePoolIds(fullCustomer)];
	return poolIds.length === 1
		? poolById({ fullCustomer, poolId: poolIds[0] })
		: undefined;
};

describe("unlimited grant joins the customer's limited pool", () => {
	test("an unlimited grant joining a limited monthly pool makes it unlimited without changing granted", () => {
		const fullCustomer = customerWithPools([paidRow()]);
		const subscriptionPoolId = poolIdOf({ fullCustomer, rowId: "cp_paid" });

		const plan = transition({ fullCustomer, incoming: [unlimitedRow()] });

		expect(plan?.insertPoolBalances).toHaveLength(0);
		expect(poolIdOf({ fullCustomer, rowId: "cp_unlimited" })).toBe(
			subscriptionPoolId,
		);
		const contribution = contributionOf({
			fullCustomer,
			rowId: "cp_unlimited",
		});
		expect(contribution?.unlimited).toBe(true);
		expect(contribution?.competes ?? false).toBe(false);
		expect(contribution?.current_contribution).toBe(0);

		const pool = onlyLivePool(fullCustomer);
		expect(pool?.pooled_balance?.id).toBe(subscriptionPoolId);
		expect(pool?.unlimited).toBe(true);
		expect(pool?.pooled_balance?.unlimited).toBe(false);
		expect(pool?.pooled_balance?.granted).toBe(100);
		expect(pool?.balance).toBe(100);
	});

	test("a lifetime unlimited grant joins a monthly limited pool, taking its cycle", () => {
		const fullCustomer = customerWithPools([paidRow()]);
		const subscriptionPool = poolById({
			fullCustomer,
			poolId: poolIdOf({ fullCustomer, rowId: "cp_paid" }),
		});

		transition({
			fullCustomer,
			incoming: [unlimitedRow({ product: lifetimeUnlimited })],
		});

		const pool = onlyLivePool(fullCustomer);
		expect(pool?.pooled_balance?.id).toBe(subscriptionPool?.pooled_balance?.id);
		expect(pool?.unlimited).toBe(true);
		expect(pool?.pooled_balance?.interval).toBe(EntInterval.Month);
		expect(pool?.pooled_balance?.reset_mode).toBe(
			PooledBalanceResetMode.Subscription,
		);
		expect(pool?.pooled_balance?.reset_cycle_anchor).toBe(
			subscriptionPool?.pooled_balance?.reset_cycle_anchor,
		);
		expect(pool?.pooled_balance?.granted).toBe(100);
	});

	test("limited and unlimited grants attached together share one pool", () => {
		const fullCustomer = customerWithPools([
			unlimitedRow({ product: lifetimeUnlimited }),
			paidRow(),
		]);

		const pool = onlyLivePool(fullCustomer);
		expect(pool?.unlimited).toBe(true);
		expect(pool?.pooled_balance?.granted).toBe(100);
		expect(pool?.pooled_balance?.reset_mode).toBe(
			PooledBalanceResetMode.Subscription,
		);
	});

	test("an unlimited grant with no limited pool keeps a pool of its own", () => {
		const fullCustomer = customerWithPools([
			unlimitedRow({ product: lifetimeUnlimited }),
		]);

		const pool = onlyLivePool(fullCustomer);
		expect(pool?.pooled_balance?.unlimited).toBe(true);
		expect(pool?.pooled_balance?.reset_mode).toBe(
			PooledBalanceResetMode.Lifetime,
		);
	});

	test("a limited grant arriving pulls the customer's unlimited pool into its own", () => {
		const fullCustomer = customerWithPools([
			unlimitedRow({ product: lifetimeUnlimited }),
		]);
		const unlimitedPoolId = poolIdOf({ fullCustomer, rowId: "cp_unlimited" });
		const unlimitedPool = poolById({ fullCustomer, poolId: unlimitedPoolId });
		if (!unlimitedPool) throw new Error("unlimited pool missing");
		unlimitedPool.balance = -10_400;

		transition({ fullCustomer, incoming: [paidRow()] });

		const subscriptionPoolId = poolIdOf({ fullCustomer, rowId: "cp_paid" });
		expect(subscriptionPoolId).not.toBe(unlimitedPoolId);
		expect(poolIdOf({ fullCustomer, rowId: "cp_unlimited" })).toBe(
			subscriptionPoolId,
		);
		const pool = onlyLivePool(fullCustomer);
		expect(pool?.pooled_balance?.id).toBe(subscriptionPoolId);
		expect(pool?.unlimited).toBe(true);
		expect(pool?.pooled_balance?.granted).toBe(100);
		expect(pool?.balance).toBe(100);
	});
});

describe("unlimited grant leaves a limited pool", () => {
	test("the last unlimited grant leaving flips the pool back to limited and forgives its usage", () => {
		const unlimited = unlimitedRow();
		const fullCustomer = customerWithPools([paidRow(), unlimited]);
		const pool = onlyLivePool(fullCustomer);
		if (!pool) throw new Error("pool missing");
		expect(pool.unlimited).toBe(true);
		pool.balance = -500;

		transition({ fullCustomer, outgoing: [unlimited] });

		const after = onlyLivePool(fullCustomer);
		expect(after?.pooled_balance?.id).toBe(pool.pooled_balance?.id);
		expect(after?.unlimited).toBe(false);
		expect(after?.pooled_balance?.granted).toBe(100);
		expect(after?.balance).toBe(100);
	});

	test("one of two unlimited grants leaving keeps the pool unlimited", () => {
		const leaving = unlimitedRow();
		const fullCustomer = customerWithPools([
			paidRow(),
			leaving,
			unlimitedRow({
				rowId: "cp_unlimited_c",
				entity: entityC,
				product: lifetimeUnlimited,
			}),
		]);
		const pool = onlyLivePool(fullCustomer);
		if (!pool) throw new Error("pool missing");
		pool.balance = -500;

		transition({ fullCustomer, outgoing: [leaving] });

		const after = onlyLivePool(fullCustomer);
		expect(after?.pooled_balance?.id).toBe(pool.pooled_balance?.id);
		expect(after?.unlimited).toBe(true);
		expect(after?.balance).toBe(-500);
		expect(after?.pooled_balance?.granted).toBe(100);
	});

	test("the limited grant leaving keeps the unlimited grant's pool unlimited", () => {
		const paid = paidRow();
		const fullCustomer = customerWithPools([paid, unlimitedRow()]);
		const poolId = onlyLivePool(fullCustomer)?.pooled_balance?.id;

		transition({ fullCustomer, outgoing: [paid] });

		const after = onlyLivePool(fullCustomer);
		expect(after?.pooled_balance?.id).toBe(poolId);
		expect(after?.unlimited).toBe(true);
		expect(after?.pooled_balance?.granted).toBe(0);
	});
});

describe("feature switched from sum to max", () => {
	test("an unlimited share converting to a competing one keeps the pool unlimited", () => {
		const grantedLimited = products.createFull({
			id: "limited_granted",
			prices: [],
			entitlements: [paidPlan.pooledEntitlement],
		});
		const customerLevel = ({
			product,
			rowId,
		}: {
			product: typeof grantedLimited;
			rowId: string;
		}): FullCusProduct => ({
			...entityRow({ product, entity: entityA, rowId }),
			internal_entity_id: null,
			entity_id: null,
			subscription_ids: [],
			customer_prices: [],
		});
		const limited = customerLevel({
			product: grantedLimited,
			rowId: "cp_limited",
		});
		const fullCustomer = customerWithPools([
			limited,
			customerLevel({ product: monthlyUnlimited, rowId: "cp_unlimited" }),
		]);
		const pool = onlyLivePool(fullCustomer);
		if (!pool) throw new Error("pool missing");
		expect(pool.unlimited).toBe(true);
		pool.balance = -500;

		const incoming = customerLevel({
			product: grantedLimited,
			rowId: "cp_limited_new",
		});
		for (const { entitlement } of [
			...fullCustomer.customer_products,
			incoming,
		].flatMap((customerProduct) => customerProduct.customer_entitlements)) {
			entitlement.feature = {
				...entitlement.feature,
				config: { ...entitlement.feature.config, combine: "max" },
			};
		}
		pool.entitlement.feature = {
			...pool.entitlement.feature,
			config: { ...pool.entitlement.feature.config, combine: "max" },
		};

		transition({ fullCustomer, incoming: [incoming] });

		expect(
			contributionOf({ fullCustomer, rowId: "cp_unlimited" })?.competes,
		).toBe(true);
		const after = onlyLivePool(fullCustomer);
		expect(after?.pooled_balance?.id).toBe(pool.pooled_balance?.id);
		expect(after?.unlimited).toBe(true);
	});
});

describe("unchanged pooling", () => {
	test("additive limited grants still sum with no unlimited involved", () => {
		const grantedPlanProduct = products.createFull({
			id: "pro_granted",
			prices: [],
			entitlements: [paidPlan.pooledEntitlement],
		});
		const fullCustomer = customerWithPools([
			paidRow(),
			{
				...entityRow({
					product: grantedPlanProduct,
					entity: entityB,
					rowId: "cp_granted",
				}),
				subscription_ids: [],
				customer_prices: [],
			},
		]);

		const pool = onlyLivePool(fullCustomer);
		expect(pool?.unlimited ?? false).toBe(false);
		expect(pool?.pooled_balance?.granted).toBe(200);
		expect(pool?.balance).toBe(200);
	});

	test("a max feature's entity-level unlimited grant keeps its own pool", () => {
		const MAX_CONFIG = { usage_type: FeatureUsageType.Single, combine: "max" };
		const maxEntitlement = ({
			id,
			unlimited,
		}: {
			id: string;
			unlimited: boolean;
		}): EntitlementWithFeature => ({
			...entitlements.create({
				id,
				featureId: "seats_max",
				featureName: "Seats",
				featureConfig: MAX_CONFIG,
				interval: EntInterval.Month,
				allowance: 50,
			}),
			...(unlimited
				? { allowance: null, allowance_type: AllowanceType.Unlimited }
				: {}),
			pooled: true,
		});
		const limitedProduct = products.createFull({
			id: "max_limited",
			prices: [paidPlan.product.prices[0]],
			entitlements: [
				maxEntitlement({ id: "ent_max_limited", unlimited: false }),
			],
		});
		const unlimitedProduct = products.createFull({
			id: "max_unlimited",
			prices: [],
			entitlements: [
				maxEntitlement({ id: "ent_max_unlimited", unlimited: true }),
			],
		});
		const fullCustomer = customerWithPools([
			{
				...entityRow({
					product: limitedProduct,
					entity: entityA,
					rowId: "cp_a",
				}),
				subscription_ids: ["sub_live"],
			},
			{
				...entityRow({
					product: unlimitedProduct,
					entity: entityB,
					rowId: "cp_b",
				}),
				subscription_ids: [],
				customer_prices: [],
			},
		]);

		const limitedPoolId = poolIdOf({ fullCustomer, rowId: "cp_a" });
		const unlimitedPoolId = poolIdOf({ fullCustomer, rowId: "cp_b" });
		expect(limitedPoolId).toBeDefined();
		expect(unlimitedPoolId).not.toBe(limitedPoolId);
		expect(
			contributionOf({ fullCustomer, rowId: "cp_b" })?.unlimited ?? false,
		).toBe(false);
		expect(
			poolById({ fullCustomer, poolId: limitedPoolId })?.unlimited ?? false,
		).toBe(false);
		expect(
			poolById({ fullCustomer, poolId: unlimitedPoolId })?.pooled_balance
				?.unlimited,
		).toBe(true);
	});
});
