import { describe, expect, test } from "bun:test";
import {
	type FullCusProduct,
	type FullCustomer,
	ms,
	PooledBalanceResetMode,
} from "@autumn/shared";
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
	SUBSCRIBED_AT,
} from "../set-plans/balances/pooledCreditsFixtures";

const paidPlan = pooledCreditsPlan({ planId: "pro", pooledAllowance: 100 });

/** A paid plan on a no-card trial: Autumn runs it until trial end, so it has no Stripe subscription. */
const trialRow = ({
	rowId,
	entity,
	onTrialEnd = "bill",
	trialEndsAt,
}: {
	rowId: string;
	entity: typeof entityA;
	onTrialEnd?: "bill" | "revert";
	trialEndsAt: number;
}): FullCusProduct => {
	const row = entityRow({ product: paidPlan.product, entity, rowId });
	return {
		...row,
		subscription_ids: [],
		on_trial_end: onTrialEnd,
		trial_ends_at: trialEndsAt,
		// The trial's credits cycle from its end, so two trials never share an anchor.
		customer_entitlements: row.customer_entitlements.map(
			(customerEntitlement) => ({
				...customerEntitlement,
				reset_cycle_anchor: trialEndsAt,
				next_reset_at: trialEndsAt,
			}),
		),
	};
};

const transition = ({
	fullCustomer,
	incoming,
	outgoing = [],
}: {
	fullCustomer: FullCustomer;
	incoming: FullCusProduct[];
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

const FIRST_TRIAL_ENDS_AT = NOW + ms.days(5);
const SECOND_TRIAL_ENDS_AT = NOW + ms.days(4);

describe("paid plan with no Stripe subscription joins an existing pool", () => {
	test("second no-card trial shares the first trial's pool and cycle", () => {
		const fullCustomer = customerWithPools([
			trialRow({
				rowId: "cp_trial_a",
				entity: entityA,
				trialEndsAt: FIRST_TRIAL_ENDS_AT,
			}),
		]);
		const firstPoolId = poolIdOf({ fullCustomer, rowId: "cp_trial_a" });
		const firstPool = poolById({ fullCustomer, poolId: firstPoolId });

		const plan = transition({
			fullCustomer,
			incoming: [
				trialRow({
					rowId: "cp_trial_b",
					entity: entityB,
					trialEndsAt: SECOND_TRIAL_ENDS_AT,
				}),
			],
		});

		expect(plan?.insertPoolBalances).toHaveLength(0);
		expect(poolIdOf({ fullCustomer, rowId: "cp_trial_b" })).toBe(firstPoolId);
		expect(livePoolIds(fullCustomer).size).toBe(1);
		const pool = poolById({ fullCustomer, poolId: firstPoolId });
		expect(pool?.pooled_balance?.granted).toBe(200);
		expect(pool?.balance).toBe(200);
		expect(pool?.pooled_balance?.reset_cycle_anchor).toBe(
			firstPool?.pooled_balance?.reset_cycle_anchor,
		);
	});

	test("no-card trial joins a subscription-backed plan's pool", () => {
		const fullCustomer = customerWithPools([
			{
				...entityRow({
					product: paidPlan.product,
					entity: entityA,
					rowId: "cp_paid",
				}),
				subscription_ids: ["sub_live"],
			},
		]);
		const subscriptionPoolId = poolIdOf({ fullCustomer, rowId: "cp_paid" });

		transition({
			fullCustomer,
			incoming: [
				trialRow({
					rowId: "cp_trial_b",
					entity: entityB,
					trialEndsAt: SECOND_TRIAL_ENDS_AT,
				}),
			],
		});

		expect(poolIdOf({ fullCustomer, rowId: "cp_trial_b" })).toBe(
			subscriptionPoolId,
		);
		expect(
			poolById({ fullCustomer, poolId: subscriptionPoolId })?.pooled_balance
				?.stripe_subscription_id,
		).toBe("sub_live");
	});

	test("reverting trial joins the existing pool too", () => {
		const fullCustomer = customerWithPools([
			trialRow({
				rowId: "cp_trial_a",
				entity: entityA,
				trialEndsAt: FIRST_TRIAL_ENDS_AT,
			}),
		]);
		const firstPoolId = poolIdOf({ fullCustomer, rowId: "cp_trial_a" });

		transition({
			fullCustomer,
			incoming: [
				trialRow({
					rowId: "cp_trial_b",
					entity: entityB,
					onTrialEnd: "revert",
					trialEndsAt: SECOND_TRIAL_ENDS_AT,
				}),
			],
		});

		expect(poolIdOf({ fullCustomer, rowId: "cp_trial_b" })).toBe(firstPoolId);
	});

	test("trial converting to paid leaves the shared pool for one its subscription can stamp", () => {
		const firstTrial = trialRow({
			rowId: "cp_trial_a",
			entity: entityA,
			trialEndsAt: FIRST_TRIAL_ENDS_AT,
		});
		const secondTrial = trialRow({
			rowId: "cp_trial_b",
			entity: entityB,
			trialEndsAt: SECOND_TRIAL_ENDS_AT,
		});
		const fullCustomer = customerWithPools([firstTrial]);
		transition({ fullCustomer, incoming: [secondTrial] });
		const sharedPoolId = poolIdOf({ fullCustomer, rowId: "cp_trial_a" });
		expect(poolIdOf({ fullCustomer, rowId: "cp_trial_b" })).toBe(sharedPoolId);

		// Trial-end billing patches the row in place before Stripe creates its subscription.
		const convertedTrial: FullCusProduct = {
			...secondTrial,
			trial_ends_at: NOW - ms.minutes(1),
		};
		const plan = transition({
			fullCustomer,
			incoming: [convertedTrial],
			outgoing: [secondTrial],
		});

		const convertedPoolId = poolIdOf({ fullCustomer, rowId: "cp_trial_b" });
		expect(convertedPoolId).not.toBe(sharedPoolId);
		const insertedPool = plan?.insertPoolBalances.find(
			({ pooled_balance }) => pooled_balance?.id === convertedPoolId,
		);
		expect(insertedPool?.pooled_balance?.reset_mode).toBe(
			PooledBalanceResetMode.Subscription,
		);
		expect(poolIdOf({ fullCustomer, rowId: "cp_trial_a" })).toBe(sharedPoolId);
	});

	test("no-card trial alone still opens its own subscription-mode pool", () => {
		const fullCustomer = customerWithPools([
			trialRow({
				rowId: "cp_trial_a",
				entity: entityA,
				trialEndsAt: FIRST_TRIAL_ENDS_AT,
			}),
		]);

		const pool = poolById({
			fullCustomer,
			poolId: poolIdOf({ fullCustomer, rowId: "cp_trial_a" }),
		});
		expect(pool?.pooled_balance?.reset_mode).toBe(
			PooledBalanceResetMode.Subscription,
		);
		expect(pool?.pooled_balance?.reset_cycle_anchor).toBe(FIRST_TRIAL_ENDS_AT);
	});

	test("second plan on a different Stripe subscription keeps its own pool", () => {
		const fullCustomer = customerWithPools([
			{
				...entityRow({
					product: paidPlan.product,
					entity: entityA,
					rowId: "cp_paid_a",
					startsAt: SUBSCRIBED_AT,
				}),
				subscription_ids: ["sub_a"],
			},
		]);
		const firstPoolId = poolIdOf({ fullCustomer, rowId: "cp_paid_a" });

		transition({
			fullCustomer,
			incoming: [
				{
					...entityRow({
						product: paidPlan.product,
						entity: entityB,
						rowId: "cp_paid_b",
						startsAt: NOW,
					}),
					subscription_ids: ["sub_b"],
				},
			],
		});

		expect(poolIdOf({ fullCustomer, rowId: "cp_paid_b" })).not.toBe(
			firstPoolId,
		);
	});
});
