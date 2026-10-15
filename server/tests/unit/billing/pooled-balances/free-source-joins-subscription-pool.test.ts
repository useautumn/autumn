import { describe, expect, test } from "bun:test";
import {
	EntInterval,
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

const paidPlan = pooledCreditsPlan({ planId: "pro", pooledAllowance: 100 });

/** A granted plan: the same pooled credits, with no prices and no Stripe subscription. */
const grantedPlanProduct = products.createFull({
	id: "pro_granted",
	prices: [],
	entitlements: [paidPlan.pooledEntitlement],
});

const paidRow = ({
	rowId = "cp_paid",
	entity = entityA,
	subscriptionId = "sub_live",
}: {
	rowId?: string;
	entity?: typeof entityA;
	subscriptionId?: string;
} = {}): FullCusProduct => ({
	...entityRow({ product: paidPlan.product, entity, rowId }),
	subscription_ids: [subscriptionId],
});

const grantedRow = ({
	rowId = "cp_granted",
	entity = entityB,
}: {
	rowId?: string;
	entity?: typeof entityB;
} = {}): FullCusProduct => ({
	...entityRow({ product: grantedPlanProduct, entity, rowId }),
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
	// An in-place update is computed against the customer as it stands: the old row stays until the plan lands.
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
	return pooledBalancePlan;
};

/** The pool a customer product's pooled credits currently feed. */
const poolIdOf = ({
	fullCustomer,
	rowId,
}: {
	fullCustomer: FullCustomer;
	rowId: string;
}) =>
	fullCustomer.customer_products
		.find(({ id }) => id === rowId)
		?.customer_entitlements.find(
			({ entitlement }) => entitlement.id === paidPlan.pooledEntitlement.id,
		)?.pooled_balance_contribution?.pooled_balance_id;

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

/** The customer's single live pool, or undefined when there is not exactly one. */
const onlyLivePoolId = (fullCustomer: FullCustomer) => {
	const poolIds = [...livePoolIds(fullCustomer)];
	return poolIds.length === 1 ? poolIds[0] : undefined;
};

describe("granted plan joins an existing subscription pool", () => {
	test("granted plan attached after a paid plan shares its pool and cycle", () => {
		const fullCustomer = customerWithPools([paidRow()]);
		const subscriptionPoolId = poolIdOf({ fullCustomer, rowId: "cp_paid" });
		const subscriptionPool = poolById({
			fullCustomer,
			poolId: subscriptionPoolId,
		});
		expect(subscriptionPool?.pooled_balance?.reset_mode).toBe(
			PooledBalanceResetMode.Subscription,
		);

		const plan = transition({ fullCustomer, incoming: [grantedRow()] });

		expect(plan?.insertPoolBalances).toHaveLength(0);
		expect(poolIdOf({ fullCustomer, rowId: "cp_granted" })).toBe(
			subscriptionPoolId,
		);
		const pool = poolById({ fullCustomer, poolId: subscriptionPoolId });
		expect(pool?.pooled_balance?.granted).toBe(200);
		expect(pool?.balance).toBe(200);
		expect(pool?.pooled_balance?.reset_cycle_anchor).toBe(
			subscriptionPool?.pooled_balance?.reset_cycle_anchor,
		);
	});

	test("granted and paid plans attached together share one pool", () => {
		const fullCustomer = customerWithPools([grantedRow(), paidRow()]);

		const poolId = poolIdOf({ fullCustomer, rowId: "cp_paid" });
		expect(poolIdOf({ fullCustomer, rowId: "cp_granted" })).toBe(poolId);
		expect(livePoolIds(fullCustomer).size).toBe(1);
		const pool = poolById({ fullCustomer, poolId });
		expect(pool?.pooled_balance?.reset_mode).toBe(
			PooledBalanceResetMode.Subscription,
		);
		expect(pool?.pooled_balance?.granted).toBe(200);
	});

	test("granted plan alone still gets a lazy pool", () => {
		const fullCustomer = customerWithPools([grantedRow()]);

		const pool = poolById({
			fullCustomer,
			poolId: poolIdOf({ fullCustomer, rowId: "cp_granted" }),
		});
		expect(pool?.pooled_balance?.reset_mode).toBe(PooledBalanceResetMode.Lazy);
	});

	test("granted plan replacing the only paid plan keeps its pool and cycle", () => {
		const paid = paidRow();
		const fullCustomer = customerWithPools([paid]);
		const subscriptionPoolId = poolIdOf({ fullCustomer, rowId: "cp_paid" });

		transition({ fullCustomer, incoming: [grantedRow()], outgoing: [paid] });

		expect(poolIdOf({ fullCustomer, rowId: "cp_granted" })).toBe(
			subscriptionPoolId,
		);
		expect(
			poolById({ fullCustomer, poolId: subscriptionPoolId })?.pooled_balance
				?.granted,
		).toBe(100);
	});

	test("granted plan joins a cancelling paid plan's pool", () => {
		const fullCustomer = customerWithPools([
			{ ...paidRow(), canceled_at: NOW },
		]);
		const subscriptionPoolId = poolIdOf({ fullCustomer, rowId: "cp_paid" });

		transition({ fullCustomer, incoming: [grantedRow()] });

		expect(poolIdOf({ fullCustomer, rowId: "cp_granted" })).toBe(
			subscriptionPoolId,
		);
	});
});

describe("paid plan attach pulls existing granted plans into its pool", () => {
	test("granted plan's lazy pool merges into the paid plan's pool", () => {
		const fullCustomer = customerWithPools([grantedRow()]);
		const lazyPoolId = poolIdOf({ fullCustomer, rowId: "cp_granted" });

		transition({ fullCustomer, incoming: [paidRow()] });

		const subscriptionPoolId = poolIdOf({ fullCustomer, rowId: "cp_paid" });
		expect(subscriptionPoolId).not.toBe(lazyPoolId);
		expect(poolIdOf({ fullCustomer, rowId: "cp_granted" })).toBe(
			subscriptionPoolId,
		);
		expect(onlyLivePoolId(fullCustomer)).toBe(subscriptionPoolId);
		const pool = poolById({ fullCustomer, poolId: subscriptionPoolId });
		expect(pool?.pooled_balance?.reset_mode).toBe(
			PooledBalanceResetMode.Subscription,
		);
		expect(pool?.pooled_balance?.granted).toBe(200);
	});

	test("usage in the lazy pool is forgiven on merge", () => {
		const fullCustomer = customerWithPools([grantedRow()]);
		const lazyPool = poolById({
			fullCustomer,
			poolId: poolIdOf({ fullCustomer, rowId: "cp_granted" }),
		});
		if (!lazyPool) throw new Error("lazy pool missing");
		lazyPool.balance = 70;

		transition({ fullCustomer, incoming: [paidRow()] });

		const pool = poolById({
			fullCustomer,
			poolId: poolIdOf({ fullCustomer, rowId: "cp_paid" }),
		});
		expect(pool?.balance).toBe(200);
	});

	test("every granted plan sharing the lazy pool moves together", () => {
		const fullCustomer = customerWithPools([
			grantedRow({ rowId: "cp_granted_b", entity: entityB }),
			grantedRow({ rowId: "cp_granted_c", entity: entityC }),
		]);

		transition({ fullCustomer, incoming: [paidRow()] });

		const subscriptionPoolId = poolIdOf({ fullCustomer, rowId: "cp_paid" });
		expect(onlyLivePoolId(fullCustomer)).toBe(subscriptionPoolId);
		expect(
			poolById({ fullCustomer, poolId: subscriptionPoolId })?.pooled_balance
				?.granted,
		).toBe(300);
	});

	test("granted plan already in the pool is left alone", () => {
		const fullCustomer = customerWithPools([paidRow(), grantedRow()]);
		const poolId = poolIdOf({ fullCustomer, rowId: "cp_paid" });
		const grantedContributionId = fullCustomer.customer_products
			.find(({ id }) => id === "cp_granted")
			?.customer_entitlements.find(
				({ entitlement }) => entitlement.id === paidPlan.pooledEntitlement.id,
			)?.pooled_balance_contribution?.id;

		const plan = transition({
			fullCustomer,
			incoming: [paidRow({ rowId: "cp_paid_c", entity: entityC })],
		});

		expect(
			plan?.deletePoolContributions.some(
				({ id }) => id === grantedContributionId,
			),
		).toBe(false);
		expect(poolIdOf({ fullCustomer, rowId: "cp_paid_c" })).toBe(poolId);
		expect(poolIdOf({ fullCustomer, rowId: "cp_granted" })).toBe(poolId);
		expect(poolById({ fullCustomer, poolId })?.pooled_balance?.granted).toBe(
			300,
		);
	});

	test("a paid plan dropping the feature in place no longer holds its old pool", () => {
		const pooledMessages = {
			...entitlements.create({
				id: "ent_messages_pooled",
				featureId: "messages",
				featureName: "Messages",
				interval: EntInterval.Month,
				allowance: 50,
			}),
			pooled: true,
		};
		const paidWithMessages = products.createFull({
			id: "pro",
			prices: paidPlan.product.prices,
			entitlements: [...paidPlan.product.entitlements, pooledMessages],
		});
		const paid: FullCusProduct = {
			...entityRow({
				product: paidWithMessages,
				entity: entityA,
				rowId: "cp_paid",
			}),
			subscription_ids: ["sub_live"],
		};
		const fullCustomer = customerWithPools([paid, grantedRow()]);
		const oldPoolId = poolIdOf({ fullCustomer, rowId: "cp_paid" });
		transition({
			fullCustomer,
			incoming: [
				paidRow({
					rowId: "cp_paid_other",
					entity: entityC,
					subscriptionId: "sub_other",
				}),
			],
		});
		expect(poolIdOf({ fullCustomer, rowId: "cp_granted" })).toBe(oldPoolId);

		const messagesOnly = products.createFull({
			id: "pro",
			prices: paidPlan.product.prices,
			entitlements: [pooledMessages],
		});
		const updated: FullCusProduct = {
			...entityRow({
				product: messagesOnly,
				entity: entityA,
				rowId: "cp_paid",
			}),
			subscription_ids: ["sub_live"],
		};
		transition({ fullCustomer, incoming: [updated], outgoing: [paid] });

		const otherPoolId = poolIdOf({ fullCustomer, rowId: "cp_paid_other" });
		expect(otherPoolId).not.toBe(oldPoolId);
		expect(poolIdOf({ fullCustomer, rowId: "cp_granted" })).toBe(otherPoolId);
	});

	test("a new subscription pulls granted plans off an ended subscription's pool", () => {
		const oldPaid = paidRow();
		const fullCustomer = customerWithPools([oldPaid, grantedRow()]);
		const oldPoolId = poolIdOf({ fullCustomer, rowId: "cp_granted" });
		transition({ fullCustomer, outgoing: [oldPaid] });
		fullCustomer.customer_products = fullCustomer.customer_products.filter(
			({ id }) => id !== oldPaid.id,
		);
		expect(poolIdOf({ fullCustomer, rowId: "cp_granted" })).toBe(oldPoolId);

		transition({
			fullCustomer,
			incoming: [paidRow({ rowId: "cp_paid_new", subscriptionId: "sub_new" })],
		});

		const newPoolId = poolIdOf({ fullCustomer, rowId: "cp_paid_new" });
		expect(newPoolId).not.toBe(oldPoolId);
		expect(poolIdOf({ fullCustomer, rowId: "cp_granted" })).toBe(newPoolId);
		expect(
			poolById({ fullCustomer, poolId: newPoolId })?.pooled_balance
				?.stripe_subscription_id,
		).toBe("sub_new");
		expect(
			poolById({ fullCustomer, poolId: newPoolId })?.pooled_balance?.granted,
		).toBe(200);
	});
});
